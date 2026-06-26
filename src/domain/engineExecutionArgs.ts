import type { DevelopmentGpuBackend } from "@/type/preload";

const ONNX_PROVIDER_ARG = "--onnx_provider";
const USE_GPU_ARG = "--use_gpu";
const AUTO_ONNX_PROVIDER = "auto";
const CUDA_ONNX_PROVIDER = "cuda";
const DIRECTML_ONNX_PROVIDER = "directml";
const GGML_ONNX_PROVIDER = "ggml";
const GGML_TTS_SERVER_BACKEND_ARG = "--ggml_tts_server_backend";

export type GgmlTtsServerBackend = "cpu" | "vulkan" | "metal";

const isDevelopmentGpuBackend = (
  value: string | undefined,
): value is DevelopmentGpuBackend => {
  return (
    value === AUTO_ONNX_PROVIDER ||
    value === DIRECTML_ONNX_PROVIDER ||
    value === CUDA_ONNX_PROVIDER ||
    value === GGML_ONNX_PROVIDER
  );
};

const getArgumentValue = (args: string[], name: string): string | undefined => {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg.startsWith(`${name}=`)) {
      return arg.slice(name.length + 1);
    }
    if (arg === name) {
      return args[index + 1];
    }
  }

  return undefined;
};

const hasArgumentValue = (
  args: string[],
  name: string,
  value: string,
): boolean => {
  return getArgumentValue(args, name) === value;
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

const removeFlagArgument = (args: string[], name: string): string[] => {
  return args.filter((arg) => arg !== name && !arg.startsWith(`${name}=`));
};

const removeManagedGpuArguments = (args: string[]): string[] => {
  return removeArgumentValue(
    removeArgumentValue(
      removeFlagArgument(args, USE_GPU_ARG),
      ONNX_PROVIDER_ARG,
    ),
    GGML_TTS_SERVER_BACKEND_ARG,
  );
};

const resolveGpuBackendSelection = (
  executionArgs: string[],
  developmentGpuBackend: DevelopmentGpuBackend,
): DevelopmentGpuBackend => {
  if (developmentGpuBackend !== AUTO_ONNX_PROVIDER) {
    return developmentGpuBackend;
  }

  const configuredProvider = getArgumentValue(executionArgs, ONNX_PROVIDER_ARG);
  if (
    isDevelopmentGpuBackend(configuredProvider) &&
    configuredProvider !== AUTO_ONNX_PROVIDER
  ) {
    return configuredProvider;
  }

  return AUTO_ONNX_PROVIDER;
};

export const isGgmlExecutionArgs = (executionArgs: string[]): boolean => {
  return hasArgumentValue(executionArgs, ONNX_PROVIDER_ARG, GGML_ONNX_PROVIDER);
};

export const resolveGgmlTtsServerBackend = (
  executionArgs: string[],
  useGpu: boolean,
  developmentGpuBackend: DevelopmentGpuBackend = "auto",
  platform: string = getCurrentPlatform(),
): GgmlTtsServerBackend | undefined => {
  if (
    resolveGpuBackendSelection(executionArgs, developmentGpuBackend) !==
    GGML_ONNX_PROVIDER
  ) {
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
  developmentGpuBackend: DevelopmentGpuBackend = "auto",
  platform: string = getCurrentPlatform(),
): string => {
  if (!useGpu) {
    return "Backend: ORT / CPU";
  }

  const gpuBackend = resolveGpuBackendSelection(
    executionArgs,
    developmentGpuBackend,
  );
  switch (gpuBackend) {
    case "auto":
      return "Backend: ORT / Auto GPU";
    case "directml":
      return "Backend: ORT / DirectML";
    case "cuda":
      return "Backend: ORT / CUDA";
    case "ggml":
      return `Backend: GGML / ${getDefaultGgmlGpuBackend(platform).toUpperCase()}`;
  }
};

/**
 * CPU/GPU モードに合わせてエンジン起動引数を解決する。
 */
export const resolveEngineExecutionArgs = (
  executionArgs: string[],
  useGpu: boolean,
  developmentGpuBackend: DevelopmentGpuBackend = "auto",
  platform: string = getCurrentPlatform(),
): string[] => {
  if (!useGpu) {
    return removeManagedGpuArguments(executionArgs);
  }

  const gpuBackend = resolveGpuBackendSelection(
    executionArgs,
    developmentGpuBackend,
  );
  switch (gpuBackend) {
    case "auto":
      return removeArgumentValue(
        removeFlagArgument(executionArgs, USE_GPU_ARG),
        GGML_TTS_SERVER_BACKEND_ARG,
      ).concat([USE_GPU_ARG]);
    case "directml":
      return replaceOrAppendArgumentValue(
        removeArgumentValue(
          removeFlagArgument(executionArgs, USE_GPU_ARG),
          GGML_TTS_SERVER_BACKEND_ARG,
        ),
        ONNX_PROVIDER_ARG,
        DIRECTML_ONNX_PROVIDER,
      );
    case "cuda":
      return replaceOrAppendArgumentValue(
        removeArgumentValue(
          removeFlagArgument(executionArgs, USE_GPU_ARG),
          GGML_TTS_SERVER_BACKEND_ARG,
        ),
        ONNX_PROVIDER_ARG,
        CUDA_ONNX_PROVIDER,
      );
    case "ggml":
      return replaceOrAppendArgumentValue(
        replaceOrAppendArgumentValue(
          removeFlagArgument(executionArgs, USE_GPU_ARG),
          ONNX_PROVIDER_ARG,
          GGML_ONNX_PROVIDER,
        ),
        GGML_TTS_SERVER_BACKEND_ARG,
        resolveGgmlTtsServerBackend(
          executionArgs,
          useGpu,
          developmentGpuBackend,
          platform,
        ) ?? getDefaultGgmlGpuBackend(platform),
      );
  }
};
