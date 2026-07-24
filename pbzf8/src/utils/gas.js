export function isGasEnv() {
  return typeof google !== "undefined" && !!google.script && !!google.script.run;
}

export function callGas(fnName, args = [], localFn = null) {
  return new Promise((resolve, reject) => {
    if (isGasEnv()) {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler(err => reject(err))
        [fnName](...args);
    } else if (localFn) {
      Promise.resolve(localFn(...args)).then(resolve).catch(reject);
    } else {
      reject(new Error(`${fnName} is not available in local mode`));
    }
  });
}
