const ONNX_PROVIDER_ARG = "--onnx_provider";
const GGML_ONNX_PROVIDER = "ggml";
const GGML_TTS_SERVER_BACKEND_ARG = "--ggml_tts_server_backend";

export type GgmlTtsServerBackend = "cpu" | "vulkan" | "metal";

const hasArgumentValue = (
  args: string[],
  name: string,
  value: string,
): boolean => {
  return args.some(
    (arg, index) =>
      arg === `${name}=${value}` || (arg === name && args[index + 1] === value),
  );
};

const getCurrentPlatform = (): string => {
  if (typeof process !== "undefined" && process.platform != undefined) {
    return process.platform;
  }

  const platform = typeof navigator !== "undefined" ? navigator.platform : "";
  if (platform.toLowerCase().includes("mac")) {
    return "darwin";
  }
  return "win32";
};

const getDefaultGgmlGpuBackend = (
  platform: string = getCurrentPlatform(),
): GgmlTtsServerBackend => {
  if (platform === "darwin") {
    return "metal";
  }
  return "vulkan";
};

const replaceOrAppendArgumentValue = (
  args: string[],
  name: string,
  value: string,
): string[] => {
  const resolvedArgs = [...args];
  const joinedArgIndex = resolvedArgs.findIndex((arg) =>
    arg.startsWith(`${name}=`),
  );

  if (joinedArgIndex !== -1) {
    resolvedArgs[joinedArgIndex] = `${name}=${value}`;
    return resolvedArgs;
  }

  const argIndex = resolvedArgs.indexOf(name);
  if (argIndex === -1) {
    return resolvedArgs.concat([name, value]);
  }

  if (argIndex === resolvedArgs.length - 1) {
    return resolvedArgs.concat([value]);
  }

  resolvedArgs[argIndex + 1] = value;
  return resolvedArgs;
};

const removeArgumentValue = (args: string[], name: string): string[] => {
  const resolvedArgs: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg.startsWith(`${name}=`)) {
      continue;
    }
    if (arg === name) {
      index++;
      continue;
    }
    resolvedArgs.push(arg);
  }

  return resolvedArgs;
};

export const isGgmlExecutionArgs = (executionArgs: string[]): boolean => {
  return hasArgumentValue(executionArgs, ONNX_PROVIDER_ARG, GGML_ONNX_PROVIDER);
};

export const resolveGgmlTtsServerBackend = (
  executionArgs: string[],
  useGpu: boolean,
  platform: string = getCurrentPlatform(),
): GgmlTtsServerBackend | undefined => {
  if (!isGgmlExecutionArgs(executionArgs)) {
    return undefined;
  }

  if (!useGpu) {
    return "cpu";
  }

  return getDefaultGgmlGpuBackend(platform);
};

export const resolveEngineBackendLabel = (
  executionArgs: string[],
  useGpu: boolean,
  platform: string = getCurrentPlatform(),
): string | undefined => {
  if (!isGgmlExecutionArgs(executionArgs)) {
    return undefined;
  }

  if (!useGpu) {
    return "Backend: ORT / CPU";
  }

  return `Backend: GGML / ${getDefaultGgmlGpuBackend(platform).toUpperCase()}`;
};

/**
 * CPU/GPU モードに合わせてエンジン起動引数を解決する。
 */
export const resolveEngineExecutionArgs = (
  executionArgs: string[],
  useGpu: boolean,
  platform: string = getCurrentPlatform(),
): string[] => {
  const ggmlBackend = resolveGgmlTtsServerBackend(
    executionArgs,
    useGpu,
    platform,
  );
  if (ggmlBackend == undefined) {
    return executionArgs.concat(useGpu ? ["--use_gpu"] : []);
  }

  if (!useGpu) {
    return removeArgumentValue(
      removeArgumentValue(executionArgs, ONNX_PROVIDER_ARG),
      GGML_TTS_SERVER_BACKEND_ARG,
    );
  }

  return replaceOrAppendArgumentValue(
    executionArgs,
    GGML_TTS_SERVER_BACKEND_ARG,
    ggmlBackend,
  );
};
