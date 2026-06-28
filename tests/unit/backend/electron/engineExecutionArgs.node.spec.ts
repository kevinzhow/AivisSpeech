import { expect, test } from "vitest";
import {
  resolveEngineBackendLabel,
  resolveEngineExecutionArgs,
  resolveGgmlTtsServerBackend,
} from "@/domain/engineExecutionArgs";

test("通常エンジンの GPU 起動では --use_gpu を追加する", () => {
  expect(resolveEngineExecutionArgs(["--enable_mock"], true)).toEqual([
    "--enable_mock",
    "--use_gpu",
  ]);
});

test("明示的に DirectML を選択した場合は DirectML provider を指定する", () => {
  expect(
    resolveEngineExecutionArgs(
      [
        "--onnx_provider",
        "ggml",
        "--ggml_tts_server_backend",
        "vulkan",
        "--disable_sentry",
        "--use_gpu",
      ],
      true,
      "directml",
    ),
  ).toEqual(["--onnx_provider", "directml", "--disable_sentry"]);
});

test("明示的に CUDA を選択した場合は CUDA provider を指定する", () => {
  expect(
    resolveEngineExecutionArgs(
      ["--enable_mock", "--ggml_tts_server_backend", "vulkan"],
      true,
      "cuda",
    ),
  ).toEqual(["--enable_mock", "--onnx_provider", "cuda"]);
});

test("CPU 起動では GPU provider 指定を取り除く", () => {
  expect(
    resolveEngineExecutionArgs(
      ["--onnx_provider", "directml", "--use_gpu", "--disable_sentry"],
      false,
      "directml",
    ),
  ).toEqual(["--disable_sentry"]);
});

test("GGML エンジンの CPU 起動では通常の ONNX Runtime CPU に切り替える", () => {
  expect(
    resolveEngineExecutionArgs(
      [
        "--onnx_provider",
        "ggml",
        "--ggml_tts_server_backend",
        "vulkan",
        "--disable_sentry",
      ],
      false,
    ),
  ).toEqual(["--disable_sentry"]);
});

test("GGML エンジンの GPU 起動では platform に合う backend に切り替える", () => {
  const expectedBackend = process.platform === "darwin" ? "metal" : "vulkan";

  expect(
    resolveEngineExecutionArgs(
      [
        "--onnx_provider=ggml",
        "--ggml_tts_server_backend=cpu",
      ],
      true,
    ),
  ).toEqual([
    "--onnx_provider=ggml",
    `--ggml_tts_server_backend=${expectedBackend}`,
  ]);
});

test("GGML エンジンには --use_gpu を追加しない", () => {
  expect(
    resolveEngineExecutionArgs(["--onnx_provider", "ggml"], true),
  ).not.toContain("--use_gpu");
});

test("明示的に GGML を選択した場合は GGML provider を指定する", () => {
  expect(
    resolveEngineExecutionArgs(["--enable_mock"], true, "ggml", "win32"),
  ).toEqual([
    "--enable_mock",
    "--onnx_provider",
    "ggml",
    "--ggml_tts_server_backend",
    "vulkan",
  ]);
});

test("GGML backend display resolves CPU/GPU backend", () => {
  expect(
    resolveEngineBackendLabel(["--onnx_provider", "ggml"], false, "auto", "win32"),
  ).toBe("Backend: ORT / CPU");
  expect(
    resolveEngineBackendLabel(["--onnx_provider", "ggml"], true, "auto", "win32"),
  ).toBe("Backend: GGML / VULKAN");
  expect(
    resolveEngineBackendLabel(
      ["--onnx_provider", "ggml"],
      true,
      "auto",
      "darwin",
    ),
  ).toBe("Backend: GGML / METAL");
  expect(
    resolveEngineBackendLabel(["--enable_mock"], true, "auto", "win32"),
  ).toBe("Backend: ORT / Auto GPU");
  expect(
    resolveEngineBackendLabel(["--enable_mock"], true, "directml", "win32"),
  ).toBe("Backend: ORT / DirectML");
  expect(
    resolveEngineBackendLabel(["--enable_mock"], true, "cuda", "win32"),
  ).toBe("Backend: ORT / CUDA");

  expect(
    resolveGgmlTtsServerBackend(
      ["--onnx_provider", "ggml"],
      false,
      "auto",
      "win32",
    ),
  ).toBe("cpu");
  expect(
    resolveGgmlTtsServerBackend(
      ["--onnx_provider", "ggml"],
      true,
      "auto",
      "win32",
    ),
  ).toBe("vulkan");
  expect(
    resolveGgmlTtsServerBackend(
      ["--onnx_provider", "ggml"],
      true,
      "auto",
      "darwin",
    ),
  ).toBe("metal");
  expect(
    resolveGgmlTtsServerBackend(["--enable_mock"], true, "auto", "win32"),
  ).toBeUndefined();
});
