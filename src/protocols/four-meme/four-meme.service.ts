import { ethers } from 'ethers';

import { FourMemeConfig, FourMemePriceResponse, FourMemeQuoteResponse } from './four-meme.types';
import { EvmTransactionData } from '../../types/evm-transaction-data';
import { IIntentProtocol } from '../../interfaces/intent-protocol';
import { ChainIdEnum, ProtocolEnum, SdkErrorEnum } from '../../types/enums';
import { PriceResponse } from '../../types/price-response';
import { QuoteResponse } from '../../types/quote-response';
import { ILogger, LoggerFactory, LogLevelEnum } from '../../utils/logger';
import { isNative } from '../../utils/is-native';
import { sdkError } from '../../utils/throw-error';
import { createErrorMessage } from '../../utils/create-error-message';
import { ZERO_ADDRESS } from '../../utils/constants';
import { GeniusIntentsSDKConfig } from '../../types/sdk-config';
import { IntentPriceParams } from '../../types/price-params';
import { IntentQuoteParams } from '../../types/quote-params';

let logger: ILogger;

/**
 * The `FourMemeService` class implements the IIntentProtocol interface for token swaps
 * using the four.meme TokenManager contracts. It provides functionality for fetching price quotes
 * and generating transaction data for token swaps on BSC where either input or output must be BNB.
 *
 * @implements {IIntentProtocol}
 */
export class FourMemeService implements IIntentProtocol {
  /**
   * The protocol identifier for four.meme Protocol.
   */
  public readonly protocol = ProtocolEnum.FOUR_MEME;

  /**
   * The list of blockchain networks supported by the four.meme service.
   */
  public readonly chains = [ChainIdEnum.BSC];

  /**
   * Indicates that the service operates only on a single blockchain.
   */
  public readonly singleChain = true;

  /**
   * Indicates that the service does not support cross-chain operations.
   */
  public readonly multiChain = false;

  /**
   * Contract addresses for TokenManager versions
   */
  private readonly _tokenManagerHelperV3 = '0xF251F83e40a78868FcfA3FA4599Dad6494E46034';

  /**
   * The RPC _provider for interacting with the blockchain.
   */
  private _provider: ethers.JsonRpcProvider;

  /**
   * The TokenManagerHelper contract instance for querying token information.
   */
  private _helperContract: ethers.Contract;

  /**
   * ABI for TokenManagerHelper3 contract
   */
  private readonly _helperAbi = [
    'function getTokenInfo(address token) external view returns (uint256 version, address tokenManager, address quote, uint256 lastPrice, uint256 tradingFeeRate, uint256 minTradingFee, uint256 launchTime, uint256 offers, uint256 maxOffers, uint256 funds, uint256 maxFunds, bool liquidityAdded)',
    'function tryBuy(address token, uint256 amount, uint256 funds) external view returns (address tokenManager, address quote, uint256 estimatedAmount, uint256 estimatedCost, uint256 estimatedFee, uint256 amountMsgValue, uint256 amountApproval, uint256 amountFunds)',
    'function trySell(address token, uint256 amount) external view returns (address tokenManager, address quote, uint256 funds, uint256 fee)',
  ];

  /**
   * ABI for TokenManager V1 contract
   */
  private readonly _tokenManagerV1Abi = [
    'function purchaseTokenAMAP(address token, uint256 funds, uint256 minAmount) external payable',
    'function purchaseTokenAMAP(uint256 origin, address token, address to, uint256 funds, uint256 minAmount) external payable',
    'function saleToken(address token, uint256 amount) external',
  ];

  /**
   * ABI for TokenManager V2 contract
   */
  private readonly _tokenManagerV2Abi = [
    'function buyTokenAMAP(uint256 amountOut, address token, uint256 funds, uint256 minAmount) external payable',
    'function sellToken(uint256 amountOut, address token, uint256 expectedAmount, uint256 minAmount) external',
  ];

  private readonly _tokenManagerV2SecondaryAbi = [
    'function buyTokenAMAP(address token, uint256 funds, uint256 minAmount) external payable',
  ];

  constructor(config: GeniusIntentsSDKConfig & FourMemeConfig) {
    if (config?.debug) {
      LoggerFactory.configure(LoggerFactory.createConsoleLogger({ level: LogLevelEnum.DEBUG }));
    }
    // Use custom logger if provided
    else if (config?.logger) {
      LoggerFactory.configure(config.logger);
    }

    logger = LoggerFactory.getLogger();

    this._provider = new ethers.JsonRpcProvider(config.bscRpcUrl);
    this._helperContract = new ethers.Contract(
      this._tokenManagerHelperV3,
      this._helperAbi,
      this._provider,
    );
  }

  public isCorrectConfig<T extends { [key: string]: string }>(config: {
    [key: string]: string;
  }): config is T {
    return (
      config && Object.keys(config).length > 0 && Object.values(config).every(value => value !== '')
    );
  }

  public async fetchPrice(params: IntentPriceParams): Promise<PriceResponse> {
    this.validatePriceParams(params);
    logger.debug(`Fetching price from ${this.protocol}`);

    try {
      const { isBuying, tokenAddress } = this._determineSwapDirection(params);

      if (isBuying) {
        if (!this._helperContract['tryBuy']) {
          throw sdkError(SdkErrorEnum.MISSING_INITIALIZATION, 'Helper contract not found');
        }

        // Buying tokens with BNB
        const buyResult = await this._helperContract['tryBuy'](
          tokenAddress,
          '0', // We only want to spend specific amount of BNB
          params.amountIn, // Amount of BNB to spend
        );

        const fourMemePriceResponse: FourMemePriceResponse = {
          routeSummary: {
            tokenIn: params.tokenIn,
            amountIn: params.amountIn,
            tokenOut: params.tokenOut,
            amountOut: buyResult.estimatedAmount.toString(),
            gas: '200000', // Estimated gas for token purchase
            route: [{ protocol: 'four.meme', percentage: 100 }],
          },
          routerAddress: buyResult.tokenManager,
        };

        return {
          protocol: this.protocol,
          networkIn: params.networkIn,
          networkOut: params.networkOut,
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amountIn: params.amountIn,
          amountOut: buyResult.estimatedAmount.toString(),
          estimatedGas: '200000',
          protocolResponse: fourMemePriceResponse,
          slippage: params.slippage,
        };
      } else {
        if (!this._helperContract['trySell']) {
          throw sdkError(SdkErrorEnum.MISSING_INITIALIZATION, 'Helper contract not found');
        }

        // Selling tokens for BNB
        const sellResult = await this._helperContract['trySell'](tokenAddress, params.amountIn);

        const fourMemePriceResponse: FourMemePriceResponse = {
          routeSummary: {
            tokenIn: params.tokenIn,
            amountIn: params.amountIn,
            tokenOut: params.tokenOut,
            amountOut: sellResult.funds.toString(),
            gas: '200000', // Estimated gas for token sale
            route: [{ protocol: 'four.meme', percentage: 100 }],
          },
          routerAddress: sellResult.tokenManager,
        };

        return {
          protocol: this.protocol,
          networkIn: params.networkIn,
          networkOut: params.networkOut,
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          amountIn: params.amountIn,
          amountOut: sellResult.funds.toString(),
          estimatedGas: '200000',
          protocolResponse: fourMemePriceResponse,
          slippage: params.slippage,
        };
      }
    } catch (error: unknown) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.PRICE_NOT_FOUND, formattedError);
    }
  }

  public async fetchQuote(
    params: IntentQuoteParams,
  ): Promise<QuoteResponse & { protocolResponse: FourMemeQuoteResponse }> {
    logger.info(`Fetching swap quote for address: ${params.from}`);
    this.validatePriceParams(params);

    try {
      const { isBuying, tokenAddress } = this._determineSwapDirection(params);

      if (!this._helperContract['getTokenInfo']) {
        throw sdkError(SdkErrorEnum.MISSING_INITIALIZATION, 'Helper contract not found');
      }

      // Get token information to determine which TokenManager version to use
      const tokenInfo = await this._helperContract['getTokenInfo'](tokenAddress);

      if (tokenInfo.liquidityAdded) {
        throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, `Four.meme token has already bonded`);
      }

      const tokensInPair = [tokenInfo[1], tokenInfo[2]];

      // If neither the tokens in the pair are equal to WRAPPED_BNB_ADDRESS, we need to wrap them
      if (tokensInPair[0] !== ZERO_ADDRESS && tokensInPair[1] !== ZERO_ADDRESS) {
        throw sdkError(
          SdkErrorEnum.QUOTE_NOT_FOUND,
          `Genius does not support launchpad tokens paired with non-native ERC20 tokens`,
        );
      }

      if (tokenInfo.tokenManager === ZERO_ADDRESS) {
        throw sdkError(
          SdkErrorEnum.QUOTE_NOT_FOUND,
          `Token ${tokenAddress} is not a Four Meme token`,
        );
      }

      const tokenManagerAddress = tokenInfo.tokenManager;
      const version = tokenInfo.version;

      let transactionData: EvmTransactionData;
      let amountOut: string;

      if (isBuying) {
        if (!this._helperContract['tryBuy']) {
          throw sdkError(SdkErrorEnum.MISSING_INITIALIZATION, 'Helper contract not found');
        }

        // Calculate minimum tokens with slippage
        const formattedAmount = this._formatAmount(params.amountIn);
        const buyResult = await this._helperContract['tryBuy'](
          tokenAddress,
          '0', // We want to spend specific amount of BNB
          formattedAmount,
        );

        amountOut = buyResult.estimatedAmount.toString();
        const minAmount = this._applySlippage(amountOut, params.slippage, false);

        // Build transaction data based on TokenManager version
        if (version === 1n) {
          const tokenManagerV1Interface = new ethers.Interface(this._tokenManagerV1Abi);

          const callData =
            params.receiver && params.receiver !== params.from
              ? tokenManagerV1Interface.encodeFunctionData('purchaseTokenAMAP', [
                  0, // origin
                  tokenAddress,
                  params.receiver,
                  formattedAmount,
                  minAmount,
                ])
              : tokenManagerV1Interface.encodeFunctionData('purchaseTokenAMAP', [
                  tokenAddress,
                  formattedAmount,
                  minAmount,
                ]);

          transactionData = {
            data: callData,
            to: tokenManagerAddress,
            value: formattedAmount,
            gasEstimate: '200000',
            gasLimit: '220000',
          };
        } else {
          const tokenManagerV2Interface = new ethers.Interface(
            params.receiver && params.receiver !== params.from
              ? this._tokenManagerV2Abi
              : this._tokenManagerV2SecondaryAbi,
          );

          const callData =
            params.receiver && params.receiver !== params.from
              ? tokenManagerV2Interface.encodeFunctionData('buyTokenAMAP', [
                  BigInt(0),
                  tokenAddress,
                  BigInt(buyResult.fee.toString()),
                  BigInt(formattedAmount),
                ])
              : tokenManagerV2Interface.encodeFunctionData('buyTokenAMAP', [
                  tokenAddress,
                  BigInt(formattedAmount),
                  BigInt(minAmount),
                ]);

          transactionData = {
            data: callData,
            to: tokenManagerAddress,
            value: params.amountIn,
            gasEstimate: '200000',
            gasLimit: '220000',
          };
        }
      } else {
        if (!this._helperContract['trySell']) {
          throw sdkError(SdkErrorEnum.MISSING_INITIALIZATION, 'Helper contract not found');
        }

        // Selling tokens for BNB
        const formattedAmount = this._formatAmount(params.amountIn);
        const sellResult = await this._helperContract['trySell'](tokenAddress, formattedAmount);

        amountOut = sellResult.funds.toString();

        if (version === 1n) {
          const tokenManagerV1Interface = new ethers.Interface(this._tokenManagerV1Abi);

          const callData = tokenManagerV1Interface.encodeFunctionData('saleToken', [
            tokenAddress,
            params.amountIn,
          ]);

          transactionData = {
            data: callData,
            to: tokenManagerAddress,
            value: '0',
            gasEstimate: '200000',
            gasLimit: '220000',
          };
        } else {
          const tokenManagerV2Interface = new ethers.Interface(this._tokenManagerV2Abi);

          const expectedAmount = BigInt(sellResult.funds.toString());
          const minAmount = this._applySlippage(expectedAmount.toString(), params.slippage, false);

          const formattedMinAmount = this._formatAmount(minAmount);
          const callData = tokenManagerV2Interface.encodeFunctionData('sellToken', [
            BigInt('0'),
            params.tokenIn,
            BigInt(formattedAmount),
            BigInt(formattedMinAmount),
          ]);

          transactionData = {
            data: callData,
            to: tokenManagerAddress,
            value: '0',
            gasEstimate: '200000',
            gasLimit: '220000',
          };
        }
      }

      const fourMemeQuoteResponse: FourMemeQuoteResponse = {
        amountIn: params.amountIn,
        amountOut,
        gas: transactionData?.gasEstimate ?? '0',
        data: transactionData.data,
        routerAddress: tokenManagerAddress,
        tokenManagerVersion: version.toString(),
        isBuying,
      };

      return {
        protocol: this.protocol,
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        amountOut,
        from: params.from,
        receiver: params.receiver || params.from,
        evmExecutionPayload: {
          transactionData,
          approval: {
            spender: tokenManagerAddress,
            token: params.tokenIn,
            amount: params.amountIn,
          },
        },
        slippage: params.slippage,
        networkIn: params.networkIn,
        networkOut: params.networkOut,
        estimatedGas: transactionData.gasEstimate,
        protocolResponse: fourMemeQuoteResponse,
      };
    } catch (error: unknown) {
      const formattedError = createErrorMessage(error, this.protocol);

      throw sdkError(SdkErrorEnum.QUOTE_NOT_FOUND, formattedError);
    }
  }

  /**
   * Determines the direction of the swap (buying or selling) and returns the token address.
   *
   * @param {PriceParams | QuoteParams} params - The swap parameters.
   *
   * @returns {{ isBuying: boolean; tokenAddress: string }} The swap direction and token address.
   */
  private _determineSwapDirection(params: IntentPriceParams | IntentQuoteParams): {
    isBuying: boolean;
    tokenAddress: string;
  } {
    const tokenInIsNative = isNative(params.tokenIn);
    const tokenOutIsNative = isNative(params.tokenOut);

    if (tokenInIsNative && !tokenOutIsNative) {
      // Buying tokens with BNB
      return { isBuying: true, tokenAddress: params.tokenOut };
    } else if (!tokenInIsNative && tokenOutIsNative) {
      // Selling tokens for BNB
      return { isBuying: false, tokenAddress: params.tokenIn };
    } else {
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        'Either input or output must be native BNB for four.meme swaps',
      );
    }
  }

  /**
   * Applies slippage to an amount.
   *
   * @param {string} amount - The base amount.
   * @param {number} slippage - The slippage percentage (0.01 = 1%).
   * @param {boolean} isMaximum - Whether to calculate maximum (true) or minimum (false) amount.
   *
   * @returns {string} The amount with slippage applied.
   */
  private _applySlippage(amount: string, slippage: number, isMaximum: boolean): string {
    const amountBN = BigInt(amount);
    const slippageBps = Math.floor(slippage * 100); // Convert percentage to basis points (10% = 1000 bps)
    const base = BigInt(10000);
    const multiplier = isMaximum ? base + BigInt(slippageBps) : base - BigInt(slippageBps);

    return ((amountBN * multiplier) / base).toString();
  }

  /**
   * Formats the given amount string to ensure it is divisible by 1 GWEI (10^9 wei).
   *
   * This method is used to avoid "GWEI" errors from the four meme contracts by aligning
   * the amount to the nearest lower value that is divisible by GWEI. If the input amount
   * is already divisible by GWEI, it is returned as-is. If the aligned amount would be zero,
   * the method returns the minimum value of 1 GWEI.
   *
   * @param amount - The amount to format, represented as a string.
   * @returns The formatted amount as a string, guaranteed to be divisible by 1 GWEI and never zero.
   */
  private _formatAmount(amount: string): string {
    /**
     * to avoid "GWEI" errors from the four meme contracts
     */

    const amountBigInt = BigInt(amount);
    const GWEI = BigInt(10 ** 9); // 1 GWEI = 10^9 wei

    // Check if already divisible by GWEI
    if (amountBigInt % GWEI === BigInt(0)) {
      return amount; // Already aligned, return as-is
    }

    // Find the closest value divisible by GWEI that's <= original amount
    const alignedAmount = (amountBigInt / GWEI) * GWEI;

    // Ensure the result is never 0
    if (alignedAmount === BigInt(0)) {
      return GWEI.toString(); // Return 1 GWEI as minimum
    }

    return alignedAmount.toString();
  }

  /**
   * Validates the parameters for a price quote request.
   *
   * @param {PriceParams} params - The parameters to validate.
   *
   * @throws {SdkError} If any of the parameters are invalid or unsupported.
   */
  protected validatePriceParams(params: IntentPriceParams): void {
    const { networkIn, networkOut, tokenIn, tokenOut } = params;
    logger.debug('Validating price params');

    if (!this.multiChain && networkIn !== networkOut) {
      logger.error('Multi-chain swaps not supported');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Multi-chain swaps not supported');
    }
    if (!this.singleChain && networkIn === networkOut) {
      logger.error('Single-chain swaps not supported');
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, 'Single-chain swaps not supported');
    }
    if (!this.chains.includes(networkIn)) {
      logger.error(`Network ${networkIn} not supported`);
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, `Network ${networkIn} not supported`);
    }
    if (!this.chains.includes(networkOut)) {
      logger.error(`Network ${networkOut} not supported`);
      throw sdkError(SdkErrorEnum.INVALID_PARAMS, `Network ${networkOut} not supported`);
    }

    // Validate that either input or output is native BNB
    const tokenInIsNative = isNative(tokenIn);
    const tokenOutIsNative = isNative(tokenOut);

    if ((!tokenInIsNative && !tokenOutIsNative) || (tokenInIsNative && tokenOutIsNative)) {
      logger.error('Either input or output must be native BNB (and not both)');
      throw sdkError(
        SdkErrorEnum.INVALID_PARAMS,
        'Either input or output must be native BNB for four.meme swaps',
      );
    }
  }
}
