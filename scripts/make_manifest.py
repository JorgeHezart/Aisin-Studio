# -*- coding: utf-8 -*-
"""
Genera un manifest local para las cards a partir de imágenes en assets/cards.
- Lee archivos de imagen locales (jpg/jpeg/png/webp/gif)
- Deriva metadatos del nombre del archivo: "Nombre [FOTOS] [VIDEOS] [SCENE opcional].ext"
- Genera un ID estable por pack (PACK_ID)
- Crea un código único ofuscado por pack y lo guarda en assets/codes.db.json (solo hashes p/n/t)
- Además genera assets/codes.plain.json con códigos legibles cuando sea posible
- Escribe assets/manifest.json con campos: file, name, id, photos, videos, scene

Uso:
      1) Coloca imágenes en assets/cards/ con nombres del estilo:
          "Elsa Frozen [110] [7] [Lingerie Vibe: Library].png"
    2) Ejecuta este script (ver README más abajo)

Notas:
- Este script es autónomo y no tiene dependencias externas.
- Si un pack ya existe, conserva su nonce/hash (mediante hashes previos).
- Ajusta SECRET si quieres rotar códigos.
"""
import os
import json
import re
import hashlib
import random
import string
from pathlib import Path
from datetime import datetime, timezone  # (ya no se usa para ts, pero se conserva si se quiere reactivar)

# ==========================
# CONFIGURACIÓN
# ==========================
# Secreto para generar hashes. Cámbialo si necesitas rotar códigos.
SECRET = "WebDesignTest-LocalCards-2025-key"

# Generador de código visible (retornamos sólo hashes a disco)
def gen_code():
    part2 = ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(4))
    part3 = ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(4))
    return f"{part2}-{part3}"

# Nonce corto por pack (5 chars)
def gen_nonce():
    return ''.join(random.choice(string.ascii_uppercase + string.digits) for _ in range(5))


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ==========================
# PARSER DE NOMBRE DE ARCHIVO
# Ejemplo esperado: "Nombre Base [100] [3].jpg"
# ==========================
def parse_filename(filename: str):
    name, _ = os.path.splitext(filename)
    parts = re.findall(r'\[(.*?)\]', name)
    base_name = name.split('[')[0].strip()

    # Solo FOTOS y VIDEOS; por defecto 1/0 si no vienen.
    photos = int(parts[0]) if len(parts) > 0 and parts[0].strip().isdigit() else 1
    videos = int(parts[1]) if len(parts) > 1 and parts[1].strip().isdigit() else 0
    # SCENE opcional como tercer bloque entre corchetes (cualquier texto)
    scene = parts[2].strip() if len(parts) > 2 else ""

    pack_id = re.sub(r'[^A-Za-z0-9]+', '_', base_name).strip('_').upper()

    return {
        'file': filename,
        'name': base_name,
        'pack_id': pack_id,
        'photos': photos,
        'videos': videos,
        'scene': scene,
    }


# ==========================
# MAIN
# ==========================
def main():
    # Rutas
    ROOT = Path(__file__).resolve().parents[1]
    ASSETS = ROOT / 'assets'
    CARDS_DIR = ASSETS / 'cards'
    JSON_DIR = ROOT / 'json'
    CODES_TXT_DIR = ROOT / 'codes_txt'
    ASSETS.mkdir(exist_ok=True, parents=True)
    CARDS_DIR.mkdir(exist_ok=True, parents=True)
    JSON_DIR.mkdir(exist_ok=True, parents=True)
    CODES_TXT_DIR.mkdir(exist_ok=True, parents=True)

    manifest_path = ASSETS / 'manifest.json'
    codes_db_path = ASSETS / 'codes.db.json'
    patreon_links_path = JSON_DIR / 'patreon_card_link.json'

    # Carga códigos anteriores si existen
    old_codes = {}
    if codes_db_path.exists():
        try:
            with open(codes_db_path, 'r', encoding='utf-8') as f:
                for row in json.load(f):
                    if isinstance(row, dict) and 'p' in row:
                        old_codes[row['p']] = row
        except Exception:
            pass

    manifest = []
    codes_db = []
    plain_codes = []  # Lista con códigos legibles cuando estén disponibles
    written_txt = 0   # contador de .txt escritos
    # Cargar links de Patreon existentes (dict: pack_id -> url)
    patreon_links: dict[str, str] = {}
    if patreon_links_path.exists():
        try:
            with open(patreon_links_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, dict):
                    patreon_links = {str(k): str(v) for k, v in data.items()}
        except Exception:
            # Si hay error, se reescribirá conservadoramente más abajo
            patreon_links = {}

    # Itera imágenes locales
    for fname in sorted(os.listdir(CARDS_DIR)):
        if not fname.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.gif')):
            continue

        entry = parse_filename(fname)
        pack_id = entry['pack_id']

        # Hash primario por pack
        p = sha256_hex(SECRET + pack_id)

        # Reusar nonce/hash si ya existe
        if p in old_codes:
            code_row = old_codes[p]
            nonce = code_row['n']
            t = code_row['t']
            code = None  # No es recuperable desde hashes previos
        else:
            nonce = gen_nonce()
            code = gen_code()
            t = sha256_hex(SECRET + pack_id + ':' + nonce + ':' + code)

        # Usar rutas web con slash (/) para el frontend
        web_path = f"assets/cards/{entry['file']}"
        manifest.append({
            'file': web_path,  # ruta relativa web
            'name': entry['name'],
            'id': pack_id,
            'photos': entry['photos'],
            'videos': entry['videos'],
            'scene': entry['scene'],
        })

        # Asegura que exista una entrada para el link de Patreon de este pack
        # Deja vacío por defecto para que el usuario lo edite luego.
        if pack_id not in patreon_links:
            patreon_links[pack_id] = ""

        codes_db.append({
            'p': p,
            'n': nonce,
            't': t,
        })

        # Agrega a códigos legibles cuando se generó uno nuevo
        plain_codes.append({
            'id': pack_id,
            'name': entry['name'],
            'nonce': nonce,
            'code': code  # será None si ya existía previamente
        })

        # Generar .txt en codes_txt sólo si hay un código visible disponible (no None)
        try:
            if code:
                # No sobrescribir si ya existe un archivo manualmente creado
                txt_path = CODES_TXT_DIR / f"{entry['name']}.txt"
                if not txt_path.exists():
                    txt_path.write_text(code, encoding='utf-8')
                    written_txt += 1
        except Exception:
            # Continuar sin interrumpir el pipeline de generación
            pass

    # Escribe resultados
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    with open(codes_db_path, 'w', encoding='utf-8') as f:
        json.dump(codes_db, f, ensure_ascii=False, indent=2)

    # Escribir codes.plain.json con códigos legibles (usar con cuidado)
    with open(ASSETS / 'codes.plain.json', 'w', encoding='utf-8') as f:
        json.dump(plain_codes, f, ensure_ascii=False, indent=2)

    # Escribir/actualizar json/patreon_card_link.json con todas las keys presentes
    with open(patreon_links_path, 'w', encoding='utf-8') as f:
        json.dump(patreon_links, f, ensure_ascii=False, indent=2)

    print(f"Manifest generado con {len(manifest)} imágenes en {manifest_path}.")
    print(f"codes.db.json generado con {len(codes_db)} entradas en {codes_db_path}.")
    print(f"codes.plain.json generado con {len(plain_codes)} entradas en {ASSETS / 'codes.plain.json'}.")
    print(f"patreon_card_link.json actualizado con {len(patreon_links)} entradas en {patreon_links_path}.")
    print(f"Se escribieron {written_txt} archivos en {CODES_TXT_DIR} (solo para códigos nuevos).")


if __name__ == '__main__':
    main()
