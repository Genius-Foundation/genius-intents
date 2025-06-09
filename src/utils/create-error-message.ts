import { AxiosError } from 'axios';

export function createErrorMessage(error: unknown): {
  errorMessage: string;
  errorMessageError: Error;
} {
  let errorMessage = '';
  if (error instanceof AxiosError) {
    const response = error?.response;
    const data = response?.data;
    if (response?.statusText) {
      errorMessage += `Status Text: ${response?.statusText}\n`;
    }
    if (data) {
      errorMessage += `Data: ${JSON.stringify(data, null, 2)}\n`;
    }
    //add url
    if (response?.config?.url) {
      errorMessage += `Url: ${response.config.url}`;
    }
    //add cause
    if (error?.code) {
      errorMessage += `Code: ${error.code}`;
    }
    if (error?.message) {
      errorMessage += `Message: ${error.message}`;
    }
  } else if (error instanceof Error) {
    errorMessage += `Error: ${error.message.slice(0, 500)}...`;
  } else if (typeof error === 'string') {
    errorMessage += `Error: ${error}`;
  } else if (typeof error === 'object') {
    errorMessage += `Error: ${JSON.stringify(error, null, 2).slice(0, 500)}...`;
  }
  return {
    errorMessage,
    errorMessageError: new Error(errorMessage),
  };
}
