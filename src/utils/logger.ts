/* eslint-disable @typescript-eslint/no-explicit-any */

export enum LogLevelEnum {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export interface ILoggerOptions {
  level?: LogLevelEnum;
}

export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
}

// Default no-op logger (silent)
export class NoOpLogger implements ILogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

// Simple console logger for debugging
export class ConsoleLogger implements ILogger {
  private _level: LogLevelEnum;

  constructor(options: ILoggerOptions = {}) {
    this._level = options.level ?? LogLevelEnum.NONE;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this._level >= LogLevelEnum.DEBUG) {
      console.debug(`[DEBUG] ${message}`, meta);
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this._level >= LogLevelEnum.INFO) {
      console.info(`[INFO] ${message}`, meta);
    }
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this._level >= LogLevelEnum.WARN) {
      console.warn(`[WARN] ${message}`, meta);
    }
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    if (this._level >= LogLevelEnum.ERROR) {
      console.error(`[ERROR] ${message}`, error, meta);
    }
  }
}

// Winston adapter
export class WinstonLogger implements ILogger {
  private _logger: any;

  constructor(winstonInstance: any) {
    this._logger = winstonInstance;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this._logger.debug(message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this._logger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this._logger.warn(message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this._logger.error(message, { error, ...meta });
  }
}

// Pino adapter
export class PinoLogger implements ILogger {
  private _logger: any;

  constructor(pinoInstance: any) {
    this._logger = pinoInstance;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this._logger.debug(meta, message);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this._logger.info(meta, message);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this._logger.warn(meta, message);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this._logger.error({ err: error, ...meta }, message);
  }
}

// SDK logging configuration
export class LoggerFactory {
  private static _instance: ILogger = new NoOpLogger();

  static getLogger(): ILogger {
    return LoggerFactory._instance;
  }

  static configure(logger: ILogger): void {
    LoggerFactory._instance = logger;
  }

  static createConsoleLogger(options?: ILoggerOptions): ILogger {
    return new ConsoleLogger(options);
  }

  static createWinstonLogger(winston: any): ILogger {
    return new WinstonLogger(winston);
  }

  static createPinoLogger(pino: any): ILogger {
    return new PinoLogger(pino);
  }
}

// Export a default logger instance (no-op by default)
export const logger = LoggerFactory.getLogger();
