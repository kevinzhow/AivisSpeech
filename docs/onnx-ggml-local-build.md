# ONNX GGML Local Build Guide

This document explains how to combine the local AivisSpeech App checkout with our fork of AivisSpeech Engine. It is intentionally limited to local development and local packaging. CI and release workflow changes are out of scope.

## How The App Selects An Engine

AivisSpeech does not connect to a GitHub fork at runtime. It only uses the engine information available in the local app configuration:

- Development mode: `.env.development` sets `executionEnabled: false` by default. The app connects to the Engine API at `host`, so you must start Engine yourself first.
- Packaged mode: `.env.production` defines the default Engine executable and arguments. `electron-builder.config.cjs` copies a local Engine directory into the packaged app.

For local packaging, the Engine directory is selected with:

```text
AIVISSPEECH_ENGINE_DIR=<engine-dist-run>
```

If it is not set, the default is:

```text
../AivisSpeech-Engine/dist/run/
```

So the app uses our fork when that directory points to a `dist/run` built from our forked Engine. No runtime GitHub lookup is involved.

## Recommended Layout

Keep the three repositories under one workspace:

```text
<workspace>/
  AivisSpeech/
  AivisSpeech-Engine/
  TTS.cpp/
```

The commands below use placeholders. Do not commit local absolute paths:

```bash
WORKSPACE=<workspace>
APP_DIR="$WORKSPACE/AivisSpeech"
ENGINE_DIR="$WORKSPACE/AivisSpeech-Engine"
TTS_CPP_DIR="$WORKSPACE/TTS.cpp"
```

## 1. Build Engine

Engine must first produce a `dist/run` directory that contains the ONNX GGML Plugin EP and TTS.cpp sidecars.

### Dependency Sources

| Dependency | Source | Purpose |
| --- | --- | --- |
| AivisSpeech-Engine | Our fork / ONNX GGML branch | Engine runtime, AIVM/AIVMX to GGUF cache preparation, ONNX GGML provider selection |
| TTS.cpp | `https://github.com/clawd20130/TTS.cpp.git`, pinned to `a053e7270261` | `libtts.so`, ggml Vulkan runtime, Style-Bert-VITS2 C API, fast Vulkan conv1d path |
| ONNX Runtime headers | `onnxruntime-linux-x64-1.26.0.tgz` | Build the Plugin EP |
| Vulkan SDK | LunarG `1.3.296.0` | Build ggml Vulkan shaders/backend when the system SDK is too old |
| `patchelf` | Linux package manager | Patch packaged shared libraries to use `$ORIGIN` rpath |

The Engine GGML cache defaults are JP-BERT FP16 `linear` plus synthesis voices
FP16 mixed precision (`f16-no-embed-norm-no-ups`). The App does not configure
those precision recipes directly; it only starts the packaged Engine with
`--onnx_provider ggml`.

### Linux System Dependencies

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  cmake \
  curl \
  git \
  libvulkan-dev \
  patchelf \
  xz-utils
```

If `glslc` is missing or too old, use the same LunarG Vulkan SDK version as the Engine build:

```bash
cd "$ENGINE_DIR"

VULKAN_SDK_VERSION=1.3.296.0
VULKAN_SDK_ARCHIVE="vulkansdk-linux-x86_64-${VULKAN_SDK_VERSION}.tar.xz"
mkdir -p download build/vulkan-sdk
curl -sSL \
  "https://sdk.lunarg.com/sdk/download/${VULKAN_SDK_VERSION}/linux/${VULKAN_SDK_ARCHIVE}" \
  -o "download/${VULKAN_SDK_ARCHIVE}"
tar -xf "download/${VULKAN_SDK_ARCHIVE}" -C build/vulkan-sdk
export VULKAN_SDK="$(find "$PWD/build/vulkan-sdk" -path '*/bin/glslc' -type f | head -n 1 | xargs dirname | xargs dirname)"
export CMAKE_PREFIX_PATH="${VULKAN_SDK}${CMAKE_PREFIX_PATH:+:${CMAKE_PREFIX_PATH}}"
export PATH="${VULKAN_SDK}/bin:${PATH}"
```

### Build TTS.cpp

```bash
git clone --recursive https://github.com/clawd20130/TTS.cpp.git "$TTS_CPP_DIR"
git -C "$TTS_CPP_DIR" checkout 7b83c9c1408ae01712d612b5ac35f63b76861e0a
git -C "$TTS_CPP_DIR" submodule update --init --recursive

cmake \
  -S "$TTS_CPP_DIR" \
  -B "$TTS_CPP_DIR/build-aivis-linux-vulkan" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=ON \
  -DTTS_BUILD_EXAMPLES=OFF \
  -DGGML_VULKAN=ON \
  -DCMAKE_BUILD_RPATH_USE_ORIGIN=ON \
  -DCMAKE_BUILD_RPATH='$ORIGIN' \
  -DCMAKE_INSTALL_RPATH='$ORIGIN'

cmake --build "$TTS_CPP_DIR/build-aivis-linux-vulkan" --target tts --parallel
```

### Build The ONNX GGML Plugin EP

```bash
cd "$ENGINE_DIR"

ORT_VERSION=1.26.0
ORT_ARCHIVE="onnxruntime-linux-x64-${ORT_VERSION}.tgz"
ORT_DIR="$PWD/build/onnxruntime-${ORT_VERSION}"

mkdir -p download "$ORT_DIR"
curl -sSL \
  "https://github.com/microsoft/onnxruntime/releases/download/v${ORT_VERSION}/${ORT_ARCHIVE}" \
  -o "download/${ORT_ARCHIVE}"
tar -xzf "download/${ORT_ARCHIVE}" -C "$ORT_DIR" --strip-components=1 --exclude='*/lib/*'

export ORT_INCLUDE_DIR="$(dirname "$(find "$ORT_DIR" -name onnxruntime_cxx_api.h -type f | head -n 1)")"

cmake \
  -S "$ENGINE_DIR/experimental/onnxruntime-ep-aivis-ggml/native" \
  -B "$ENGINE_DIR/build/onnx-ggml-native" \
  -DCMAKE_BUILD_TYPE=Release \
  -DORT_INCLUDE_DIR="$ORT_INCLUDE_DIR"

cmake --build "$ENGINE_DIR/build/onnx-ggml-native" --config Release --parallel
cmake --install "$ENGINE_DIR/build/onnx-ggml-native" --config Release \
  --prefix "$ENGINE_DIR/experimental/onnxruntime-ep-aivis-ggml/src"
```

### Package Engine

```bash
cd "$ENGINE_DIR"

AIVIS_ONNX_GGML_REQUIRED=1 \
AIVIS_TTS_CPP_LIBRARY_PATH="$TTS_CPP_DIR/build-aivis-linux-vulkan/src/libtts.so" \
AIVIS_TTS_CPP_LIBRARY_DIRS="$TTS_CPP_DIR/build-aivis-linux-vulkan/src:$TTS_CPP_DIR/build-aivis-linux-vulkan/ggml/src:$TTS_CPP_DIR/build-aivis-linux-vulkan/ggml/src/ggml-vulkan" \
uv run --group build pyinstaller --noconfirm run.spec
```

The packaged Engine must contain:

```text
$ENGINE_DIR/dist/run/run
$ENGINE_DIR/dist/run/lib/libtts.so
$ENGINE_DIR/dist/run/onnxruntime_ep_aivis_ggml/lib/libaivis_ggml_onnx_ep.so
```

Verify the package without relying on `LD_LIBRARY_PATH`:

```bash
cd "$ENGINE_DIR"

ldd dist/run/lib/libtts.so

env -u LD_LIBRARY_PATH ./dist/run/run \
  --host 127.0.0.1 \
  --port 10109 \
  --onnx_provider ggml \
  --ggml_tts_server_backend vulkan \
  --ggml_native_library_path lib/libtts.so \
  --onnx_ep_library_path onnxruntime_ep_aivis_ggml/lib/libaivis_ggml_onnx_ep.so \
  --disable_sentry
```

In another terminal:

```bash
curl -fsS http://127.0.0.1:10109/version
```

## Benchmark Snapshot

The current Windows Intel Arc B580 local benchmark uses the same
`tempoDynamicsScale=1.0` path that the App gets from the Engine `/audio_query`
default. Raw JSON and WAV audio samples are maintained in the Engine repo under
`docs/res/onnx-ggml-plugin-benchmark/`.

| text length | ONNX CPU RTF | ONNX DirectML RTF | ONNX GGML Plugin EP Vulkan RTF |
| --- | ---: | ---: | ---: |
| short | `0.425` | `2.402` | `0.105` |
| medium | `0.373` | `1.390` | `0.098` |
| long | `0.284` | `0.207` | `0.056` |
| overall mean | `0.361` | `1.333` | `0.087` |

Provider validation for this run:

```json
{
  "onnx-cpu": ["CPUExecutionProvider"],
  "onnx-directml": ["DmlExecutionProvider", "CPUExecutionProvider"],
  "onnx-ggml-vulkan": ["AivisGgmlExecutionProvider", "CPUExecutionProvider"]
}
```

On this machine, DirectML remains shape-sensitive and can still be slow for new
short or medium sentences. The GGML Plugin EP Vulkan path is faster than both
ONNX CPU and ONNX DirectML for all three warm-run text lengths with the pinned
TTS.cpp build above.

## 2. Run The App In Development Mode

For development, start Engine manually and let the app connect to it.

Start Engine first:

```bash
cd "$ENGINE_DIR"

env -u LD_LIBRARY_PATH ./dist/run/run \
  --host 127.0.0.1 \
  --port 10101 \
  --onnx_provider ggml \
  --ggml_tts_server_backend vulkan \
  --ggml_native_library_path lib/libtts.so \
  --onnx_ep_library_path onnxruntime_ep_aivis_ggml/lib/libaivis_ggml_onnx_ep.so \
  --disable_sentry
```

Then start the app:

```bash
cd "$APP_DIR"
pnpm i
pnpm run electron:serve
```

`.env.development` points to `http://127.0.0.1:10101` by default and sets `executionEnabled: false`, so the app does not start Engine in this mode.

## 3. Package The App Locally

To test the path used by a packaged app, let electron-builder copy the Engine directory into the app package:

```bash
cd "$APP_DIR"

AIVISSPEECH_ENGINE_DIR="$ENGINE_DIR/dist/run" \
pnpm run electron:build
```

If the repositories use the recommended layout, `AIVISSPEECH_ENGINE_DIR` can be omitted because the default is:

```text
../AivisSpeech-Engine/dist/run/
```

The packaged app receives Engine under its `AivisSpeech-Engine/` directory. On Linux, the app maps the default Windows-style sidecar paths from `.env.production` to Linux names:

```text
AivisSpeech-Engine/run.exe -> AivisSpeech-Engine/run
lib/tts.dll -> lib/libtts.so
onnxruntime_ep_aivis_ggml/lib/aivis_ggml_onnx_ep.dll -> onnxruntime_ep_aivis_ggml/lib/libaivis_ggml_onnx_ep.so
```

## Troubleshooting

The app does not automatically use the fork:

The local app only uses `host`, `executionFilePath`, and the Engine directory copied during packaging. Build the forked Engine first, then point `AIVISSPEECH_ENGINE_DIR` to its `dist/run`.

Engine fails to find `libggml*.so*`:

Install `patchelf` and package Engine again. `libtts.so` dependencies should resolve from `dist/run/lib`.

The app does not start Engine in development mode:

This is expected. `.env.development` sets `executionEnabled: false`, so Engine must be started manually.

Local generated files that should not be committed:

```text
AivisSpeech/dist/
AivisSpeech/dist_electron/
AivisSpeech/public/licenses.json
AivisSpeech-Engine/build/
AivisSpeech-Engine/dist/
AivisSpeech-Engine/download/
```
