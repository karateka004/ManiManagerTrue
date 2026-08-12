# -*- coding: utf-8 -*-
"""
Сборка спрайтов мини-игры «Сад» из ассет-паков CraftPix.

Исходники лежат в `assets-raw/` (в репозиторий не попадают — лицензия запрещает
перераспространять сами паки). Отсюда в `src/assets/game/` уезжают только
нарезанные спрайты как игровой контент — это лицензией разрешено.

Атласы режутся по явным регионам: автопоиск связных областей на этих атласах
не работает — объекты соприкасаются одиночными пикселями листвы и слипаются
в один кусок. Регион задаётся с запасом, точные границы находит `trim()`.

Запуск (из корня проекта):
    python tools/build_assets.py
"""
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "assets-raw")
PLAT = os.path.join(RAW, "platformer", "PNG")
OUT = os.path.join(ROOT, "src", "assets", "game")

OBJECTS = os.path.join(PLAT, "Objects.png")
DETAILS = os.path.join(PLAT, "Details.png")
TILESET = os.path.join(PLAT, "Tileset.png")
BG = os.path.join(PLAT, "Background", "x32")

T = 32  # размер тайла


def trim(im: Image.Image) -> Image.Image:
    """Обрезает прозрачные поля — регионы задаём с запасом, границы ищем здесь."""
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def region(atlas: Image.Image, x0: int, y0: int, x1: int, y1: int) -> Image.Image:
    return trim(atlas.crop((x0, y0, x1, y1)))


def tiles(atlas: Image.Image, r0: int, c0: int, r1: int, c1: int) -> Image.Image:
    """Прямоугольник тайлов включительно."""
    return atlas.crop((c0 * T, r0 * T, (c1 + 1) * T, (r1 + 1) * T))


# ── Дерево: 9 стадий (0…8). Ранние — кусты, поздние — деревья, финал с домиком ──
# Координаты выверены по атласу: объекты стоят плотно, поэтому регион задан
# по границам «своего» объекта, а trim() снимает остатки прозрачных полей.
TREE_REGIONS = {
    "tree-1": (731, 216, 799, 236),   # росток-кустик
    "tree-2": (731, 262, 799, 302),   # куст
    "tree-3": (801, 214, 886, 254),   # куст гуще
    "tree-4": (731, 29, 799, 93),     # саженец
    "tree-5": (801, 24, 886, 112),    # деревце
    "tree-6": (505, 19, 618, 164),    # молодое дерево с дуплом
    "tree-7": (22, 13, 224, 315),     # взрослое дерево
    "tree-8": (227, 13, 437, 315),    # дерево с домиком и гирляндой — финал
}

# Соседние предметы (пеньки, сундук, ключ) перекрываются с кроной по горизонтали,
# поэтому обрезкой не отделяются — вычищаем их прямоугольниками в координатах атласа.
ERASE = {
    "tree-7": [(170, 175, 224, 315)],
    "tree-8": [(227, 120, 258, 315), (386, 215, 437, 315)],
}

DECOR_REGIONS = {
    "decor-mushroom-big": (896, 8, 950, 50),
    "decor-mushroom-mid": (896, 78, 950, 118),
    "decor-mushroom-small": (896, 205, 945, 240),
    "decor-crystal": (1042, 130, 1080, 180),
    "decor-chest": (1199, 270, 1270, 315),
    "decor-sign": (1090, 210, 1160, 260),
}


def build_tree_stages(out: dict) -> None:
    atlas = Image.open(OBJECTS).convert("RGBA")
    for name, r in TREE_REGIONS.items():
        work = atlas.copy()
        for ex0, ey0, ex1, ey1 in ERASE.get(name, []):
            work.paste((0, 0, 0, 0), (ex0, ey0, ex1, ey1))
        out[name] = region(work, *r)
    # Стадия 0 — семечко в холмике: в паках подходящего спрайта нет.
    out["tree-0"] = seed_sprite()


def seed_sprite() -> Image.Image:
    """Крошечный росток в рыхлой земле — единственный дорисованный спрайт."""
    from PIL import ImageDraw
    img = Image.new("RGBA", (26, 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([2, 9, 23, 19], fill=(74, 56, 38, 255))
    d.ellipse([5, 8, 20, 15], fill=(104, 78, 52, 255))
    d.line([13, 10, 13, 5], fill=(96, 132, 62, 255))
    d.ellipse([7, 3, 13, 8], fill=(140, 186, 92, 255))
    d.ellipse([13, 1, 19, 6], fill=(164, 206, 108, 255))
    return img


def build_ground(out: dict) -> None:
    """
    Островок из тайлсета. Обе версии — цельные куски атласа: сшивать остров из
    повторяющейся центральной колонки нельзя, тайлы не бесшовные по вертикали
    и на стыках появляются полосы.
    """
    atlas = Image.open(TILESET).convert("RGBA")
    out["ground"] = trim(tiles(atlas, 6, 3, 9, 6))    # 128×116, «капля» под ранние стадии
    out["ground-wide"] = trim(tiles(atlas, 7, 7, 9, 12))  # широкий массив под взрослое дерево


def build_background(out: dict) -> None:
    """
    Слои параллакса: небо, облака, дальний и ближний лес.
    Ширину режем до 480px — сцена уже мобильного экрана, а полные 960px
    стоили бы 140 КБ на двух слоях листвы.
    """
    for src, name, h in (("Skyx32", "bg-sky", 200), ("Clouds_x32", "bg-clouds", 160),
                         ("Flora1x32", "bg-far", 150), ("Flora2x32", "bg-near", 130)):
        im = Image.open(os.path.join(BG, src + ".png")).convert("RGBA")
        out[name] = im.crop((0, im.height - h, 480, im.height))


def build_decor(out: dict) -> None:
    atlas = Image.open(OBJECTS).convert("RGBA")
    for name, r in DECOR_REGIONS.items():
        out[name] = region(atlas, *r)
    details = Image.open(DETAILS).convert("RGBA")
    out["decor-stones"] = region(details, 0, 0, 224, 130)
    out["decor-grass"] = region(details, 0, 300, 224, 420)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    sprites: dict = {}
    build_tree_stages(sprites)
    build_ground(sprites)
    build_background(sprites)
    build_decor(sprites)

    total = 0
    for name, im in sorted(sprites.items()):
        path = os.path.join(OUT, f"{name}.png")
        im.save(path, "PNG", optimize=True)
        size = os.path.getsize(path)
        total += size
        print(f"  ✓ {name}.png  {im.width}×{im.height}  {size / 1024:.1f} KB")
    print(f"готово: {len(sprites)} спрайтов, {total / 1024:.0f} KB → src/assets/game")


if __name__ == "__main__":
    main()
