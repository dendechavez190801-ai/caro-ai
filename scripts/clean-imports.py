"""
Limpia los archivos exportados de "joy-ai-multiplatform".

Problema: la herramienta de exportacion envolvio imports/rutas/URLs en marcadores
`@file:`...`` y `@url:`...`` y ademas appendeo lineas de error al final.

Uso:
    python scripts/clean-imports.py

Lee de ../archivos-pendientes y escribe en la raiz del proyecto.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT.parent / "archivos-pendientes"

MAP = {
    "01-joy-ai-multiplatform-package.txt": "package.json",
    "02-joy-ai-multiplatform-android-build.gradle.txt": "android/app/build.gradle",
    "03-joy-ai-multiplatform-vite.config.txt": "vite.config.ts",
    "04-joy-ai-multiplatform-tsconfig.txt": "tsconfig.json",
    "05-joy-ai-multiplatform-index.html.txt": "index.html",
    "06-joy-ai-multiplatform-main.tsx.txt": "src/main.tsx",
    "07-joy-ai-multiplatform-index.css.txt": "src/index.css",
    "08-joy-ai-multiplatform-types.ts.txt": "src/types.ts",
    "09-joy-ai-multiplatform-Header.tsx.txt": "src/components/Header.tsx",
}

# `@file:`X``  ->  `@X`   (el marcador se comio el @ del paquete/ruta)
RE_FILE = (re.compile(r"@file:`([^`]*)`"), r"@\1")
# `@url:`X``   ->  X
RE_URL = (re.compile(r"@url:`([^`]*)`"), r"\1")

# Reglas por archivo. vite.config.ts necesita contenido escrito a mano.
RULES: dict[str, list[tuple[re.Pattern[str], str]]] = {
    "package.json": [RE_FILE],
    "android/app/build.gradle": [RE_URL],
    "tsconfig.json": [(re.compile(r'"@file:`/\*"?"'), '"@/*"')],
    "index.html": [RE_URL],
}

# Lineas de error que la herramienta appendeo al final de cada archivo.
JUNK = re.compile(r"^\s*(---\s|-\s*@file:|-\s*@url:|@url:.*\s->\s)")

VITE_CONFIG = """import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 3000,
        host: '0.0.0.0',
    },
    build: {
        outDir: 'dist',
        chunkSizeWarningLimit: 2000,
    },
});
"""


def clean(text: str, rules: list[tuple[re.Pattern[str], str]]) -> tuple[str, int, int]:
    kept, dropped = [], 0
    for line in text.splitlines():
        if JUNK.match(line):
            dropped += 1
            continue
        kept.append(line)
    text = "\n".join(kept).rstrip() + "\n"
    n = 0
    for pattern, repl in rules:
        text, k = pattern.subn(repl, text)
        n += k
    return text, n, dropped


def main() -> int:
    if not SRC.is_dir():
        print(f"ERROR: no existe {SRC}", file=sys.stderr)
        return 1
    total_markers = total_junk = 0
    for src_name, dst_rel in MAP.items():
        src = SRC / src_name
        if not src.is_file():
            print(f"  ! falta {src_name}")
            continue
        if dst_rel == "vite.config.ts":
            cleaned, n, dropped = VITE_CONFIG, 0, 0
        else:
            cleaned, n, dropped = clean(src.read_text(encoding="utf-8"), RULES.get(dst_rel, []))
        dst = ROOT / dst_rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(cleaned, encoding="utf-8")
        total_markers += n
        total_junk += dropped
        print(f"  ok {src_name:52s} -> {dst_rel:34s} ({n:2d} marcadores, {dropped:2d} lineas de error)")
    print(f"\nTotal: {total_markers} marcadores limpiados, {total_junk} lineas de error eliminadas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
