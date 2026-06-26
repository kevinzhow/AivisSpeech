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

test("GGML backend display resolves CPU/GPU backend", () => {
  expect(resolveEngineBackendLabel(["--onnx_provider", "ggml"], false, "win32"))
    .toBe("Backend: ORT / CPU");
  expect(resolveEngineBackendLabel(["--onnx_provider", "ggml"], true, "win32"))
    .toBe("Backend: GGML / VULKAN");
  expect(resolveEngineBackendLabel(["--onnx_provider", "ggml"], true, "darwin"))
    .toBe("Backend: GGML / METAL");
  expect(resolveEngineBackendLabel(["--enable_mock"], true, "win32"))
    .toBeUndefined();

  expect(
    resolveGgmlTtsServerBackend(["--onnx_provider", "ggml"], false, "win32"),
  ).toBe("cpu");
  expect(
    resolveGgmlTtsServerBackend(["--onnx_provider", "ggml"], true, "win32"),
  ).toBe("vulkan");
  expect(
    resolveGgmlTtsServerBackend(["--onnx_provider", "ggml"], true, "darwin"),
  ).toBe("metal");
  expect(
    resolveGgmlTtsServerBackend(["--enable_mock"], true, "win32"),
  ).toBeUndefined();
});
