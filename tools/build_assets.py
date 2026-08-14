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
import colorsys
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

# Цвет неба пака — в него растворяем дальние слои (атмосферная перспектива).
SKY_TINT = (168, 176, 214)


def trim(im: Image.Image) -> Image.Image:
    """Обрезает прозрачные поля — регионы задаём с запасом, границы ищем здесь."""
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def unify(im: Image.Image, stone: bool = False) -> Image.Image:
    """
    Сводит спрайты трёх паков к одной палитре — главная причина ощущения коллажа.

    Всегда: кислотно-жёлтая трава и листва (h≈55–85°) → спокойная зелень. Это
    нужно применять и к тайлсету, и к деревьям, иначе трава острова разъедется
    с листвой.

    `stone=True` дополнительно уводит холодный сине-серый камень в тёплый —
    только для тайлсета. К объектам это правило применять нельзя: под него
    попадают синий кристалл и другой цветной декор.
    """
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            deg = hh * 360
            if stone and 185 <= deg <= 265 and ss > 0.08:
                hh, ss, vv = 30 / 360, ss * 0.55, vv * 1.05
            elif 55 <= deg <= 85 and ss > 0.25:
                hh, ss, vv = (deg + 26) / 360, ss * 0.86, vv * 0.97
            else:
                continue
            nr, ng, nb = colorsys.hsv_to_rgb(hh, min(ss, 1.0), min(vv, 1.0))
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return im


def fade_to(im: Image.Image, color, k: float) -> Image.Image:
    """
    Атмосферная перспектива: подмешиваем цвет неба к дальним слоям, чтобы фон
    ушёл назад и перестал спорить с деревом. Честнее, чем гасить насыщенность:
    лес остаётся лесом, просто «за дымкой».
    """
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            px[x, y] = (
                round(r + (color[0] - r) * k),
                round(g + (color[1] - g) * k),
                round(b + (color[2] - b) * k),
                a,
            )
    return im


def recolor(im: Image.Image, hue_shift=0.0, sat=1.0, val=1.0, only_hue=None) -> Image.Image:
    """
    Сдвиг палитры в HSV. Нужен, чтобы свести три пака к одной гамме: тайлсет
    нарисован в холодном сине-фиолетовом камне, фон — в голубоватой дымке,
    а деревья — в тёплой зелени. Без этого сцена выглядит как коллаж.

    `only_hue=(lo, hi)` ограничивает правку диапазоном оттенков (0..1),
    чтобы, например, перекрасить камень, не тронув траву.
    """
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if only_hue and not (only_hue[0] <= hh <= only_hue[1]):
                continue
            hh = (hh + hue_shift) % 1.0
            ss = max(0.0, min(1.0, ss * sat))
            vv = max(0.0, min(1.0, vv * val))
            nr, ng, nb = colorsys.hsv_to_rgb(hh, ss, vv)
            px[x, y] = (round(nr * 255), round(ng * 255), round(nb * 255), a)
    return im


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
    atlas = unify(Image.open(OBJECTS).convert("RGBA"))
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
    atlas = unify(Image.open(TILESET).convert("RGBA"), stone=True)
    out["ground"] = trim(tiles(atlas, 6, 3, 9, 6))          # «капля» — основной остров
    out["ground-wide"] = trim(tiles(atlas, 7, 7, 9, 12))    # широкий массив под взрослое дерево


def build_background(out: dict) -> None:
    """
    Слои параллакса: небо, облака, дальний и ближний лес.
    Ширину режем до 480px — сцена уже мобильного экрана, а полные 960px
    стоили бы 140 КБ на двух слоях листвы.
    """
    for src, name, h in (("Skyx32", "bg-sky", 200), ("Clouds_x32", "bg-clouds", 160),
                         ("Flora1x32", "bg-far", 150), ("Flora2x32", "bg-near", 130)):
        im = Image.open(os.path.join(BG, src + ".png")).convert("RGBA")
        im = im.crop((0, im.height - h, 480, im.height))
        # Дальний лес растворяем в небе сильнее ближнего — сцена получает глубину.
        # unify к фону НЕ применяем: он съедает лесную зелень и оставляет серую кашу.
        if name == "bg-far":
            im = fade_to(im, SKY_TINT, 0.40)
        elif name == "bg-near":
            im = fade_to(im, SKY_TINT, 0.15)
        out[name] = im


def build_decor(out: dict) -> None:
    atlas = unify(Image.open(OBJECTS).convert("RGBA"))
    for name, r in DECOR_REGIONS.items():
        out[name] = region(atlas, *r)
    details = unify(Image.open(DETAILS).convert("RGBA"), stone=True)
    # Компактная горка камней: широкая россыпь в силуэте коллекции читалась как пятно.
    out["decor-stones"] = region(details, 24, 6, 92, 46)
    out["decor-grass"] = region(details, 0, 300, 120, 360)


# ── Иконки улучшений 16×16 ──────────────────────────────────────────────
# Рисуем сами: в паках нет листа, корней, лейки и камня в нужном стиле, а
# эмодзи в пиксель-арт сцене выглядят чужеродно. Символ → цвет из палитры ниже.
ICON_COLORS = {
    "g": (104, 163, 82, 255), "G": (153, 206, 106, 255), "d": (72, 122, 64, 255),
    "e": (38, 66, 40, 255), "b": (116, 82, 50, 255), "B": (150, 110, 68, 255),
    "k": (52, 34, 20, 255), "s": (146, 143, 136, 255), "S": (186, 184, 176, 255),
    "t": (104, 100, 94, 255), "w": (98, 174, 204, 255), "W": (158, 214, 232, 255),
    "m": (170, 176, 186, 255), "M": (120, 128, 140, 255),
}

ICONS = {
    "icon-leaves": [
        "................", "...........ee...", ".........eeGe...", ".......eeGGGe...",
        ".....eeGGGGge...", "....eGGGgggge...", "...eGGgggggde...", "..eGGgggggdde...",
        "..eGgggggddde...", "..eGggggdddee...", "..eGgggdddee....", "..eeggddee......",
        "...eeddee.......", "....ekee........", "...ek...........", "..ek............",
    ],
    "icon-water": [
        "................", "................", "........mmmm....", ".......mMMMMm...",
        "..mm..mMmmmmMm..", ".m..m.mMmmmmMm..", "m....mmMmmmmMm..", "m...mmmMmmmmMm..",
        ".mmmmmmMmmmmMm..", "......mMmmmmMm..", "......mMMMMMMm..", ".......mmmmmm...",
        "....WW..........", "...WwW..........", "...Ww...........", "....W...........",
    ],
    "icon-roots": [
        "................", "......bbbb......", "......bBBb......", "......bBBb......",
        "......bBBb......", ".....kbBBbk.....", "....kbbBBbbk....", "...kb.bBBb.bk...",
        "..kb..bBBb..bk..", ".kb..kbbbbk..bk.", "kb..kb....bk..bk", "b..kb......bk..b",
        "..kb........bk..", ".kb..........bk.", "kb............bk", "................",
    ],
    "icon-stones": [
        "................", "................", "......ttt.......", ".....tSSSt......",
        "....tSSSSSt.....", "....tSSssst.....", "...tSsssssst....", "...tssssssst....",
        "..ttsssssssit...".replace("i", "s"), "..ttsssssttt....", "...ttttttt......", "......ttt.......",
        "..ttt...........", ".tSSSt..........", ".tssst..........", "..ttt...........",
    ],
}


def build_icons(out: dict) -> None:
    for name, rows in ICONS.items():
        img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        px = img.load()
        for y, row in enumerate(rows):
            for x, ch in enumerate(row[:16]):
                if ch in ICON_COLORS:
                    px[x, y] = ICON_COLORS[ch]
        out[name] = img


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    sprites: dict = {}
    build_tree_stages(sprites)
    build_ground(sprites)
    build_background(sprites)
    build_decor(sprites)
    build_icons(sprites)

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
