# Figma Implementation Notes

## Element Param Table

| Area | Figma node | Parameters used |
| --- | --- | --- |
| Loading screen | `2:156` | `1440x900`, blue `#385ADF`, title group centered at `top:349`, title green `#00FD61`, copy at `top:465`, `16px`, letter spacing `3.2px`, white 60% |
| Loading title | `14:34`, `14:36`, `14:37` | English Caveat Bold `57px`, Chinese HCSZT `81px`, green `#00FD61`, sequential writing animation |
| Main canvas | `1:3` | `1440x900`, background `#EDEDF3`, code-generated dot grid with `2px` dots and `16px` spacing |
| Avatar card | `14:151` | Canvas position `x=403 y=234`, `200x326`, radius `12px`, white `4px` border, shadow `0 8px 16px rgba(120,136,191,.25)`, local image asset |
| Placeholder card | `96:245` | Canvas position `x=830 y=353`, `250x326`, dashed pale blue boundary, local Figma asset used as visual reference and CSS boundary kept editable |
| Left page nav | `72:179` | Fixed `left:0 top:56`, `220x660`, glass white `rgba(255,255,255,.7)`, blur `10px`, right/bottom border `rgba(28,59,180,.2)` |
| Header | `14:180` | Fixed `top:0`, height `56`, glass white, blur `10px`, centered tabs, right buttons |
| Bottom toolbar | `57:45` | Fixed `left:220 bottom:0`, width `calc(100% - 220px)`, tool groups `40px` high, glass white, blur `5px`, icons `24px` wrappers |
| Minimap | `72:180`, `73:184` | Fixed `left:0 top:auto bottom:0`, `220x184`, map body `196x111`, live block rectangles and viewport frame |
| Scrollbars | `50:396`, `50:400` | Thin bars shown when panning/zooming, horizontal below toolbar area, vertical at right edge |

## Interaction Note Table

| Area | Source | Trigger | Expected behavior | Status |
| --- | --- | --- | --- | --- |
| Loading entry | `2:156` annotation | Click or any key after loading text completes | Loading page fades out and main canvas appears | Implemented |
| Loading title | `14:34` annotation | Initial page load | Path-like sequential writing effect | Implemented with clipping/stroke-style reveal |
| Loading copy | `10:17` annotation | Initial page load | Typewriter, smooth opacity, cursor blinks at least 3 times, then becomes entry prompt with 2s shine | Implemented |
| Page add | `47:297` annotation | Click plus | Add `New page`, current-session only | Implemented |
| Page nav | document rules | Click child page | Switch to blank canvas; group only expands/collapses | Implemented |
| Tree toggle | `72:144` annotation | Hover group, click toggle | Toggle child page visibility | Implemented |
| Like | `47:347`, `94:244` | Click | First contribution increases count once; active state green; localStorage records contribution and active state | Implemented |
| Comment | `47:350` + document scope | Click | No modal this round; keep hover/active feedback | Implemented |
| Tool mode | `103:278`, toolbar notes | Click tool buttons | Select, hand, connect, zoom are mutually exclusive | Implemented |
| Add menu | `56:80` annotation | Click add | Menu with sticky note, image, text box, link card; adds near viewport center | Implemented |
| Pan | toolbar note | Hand drag, middle mouse, or space+left drag | Move canvas preview | Implemented |
| Zoom | `55:54` annotation | Zoom mode wheel or Ctrl/Command wheel | Zoom at pointer, range `0.25-2.5` | Implemented |
| Fit content | `57:33` annotation | Click fit | Fit all blocks with about `64px` margin and smooth transition | Implemented |
| Drag/resize | `14:151` annotation | Drag block or resize handles | Snap position and dimensions to `16px` grid | Implemented |
| Connections | `96:250`, `96:246` | Hover selected blocks, connect mode, drag/click endpoints | Green dashed rounded path updates with blocks | Implemented |
| Undo | `75:191` annotation | Click undo | Undo add, move, resize, connect | Implemented |

## State Table

| State | Figma/node source | Implementation |
| --- | --- | --- |
| Loading typing | `10:17` | Timed JS typewriter and cursor blink |
| Loading ready | `10:17` annotation | Prompt text with shine every 2s |
| Main page selected | `14:53` | Blue nav row with white text |
| Page hover | `14:54` annotation | Pale `rgba(28,59,180,.05)` background |
| Tree expanded/collapsed | `72:143`, `72:144` | Toggle button and child list visibility |
| Like inactive/active | `94:244` | Inactive pale button; active green with count |
| Tool unselected/hover/selected | `103:278` and toolbar annotations | `24x24` icon wrappers, selected green |
| Connect point hidden/visible | `96:246` | Hidden by default, visible on hover/selected/connect mode |
| Blank child pages | document rules | Empty dot canvas with same chrome |

## Asset Map

All visible Figma-provided graphics were downloaded to `assets/figma/` and referenced locally in the delivered code. No remote Figma asset URL remains in the page files.

| Asset | Figma source | Local file |
| --- | --- | --- |
| Avatar image | `14:151` | `assets/figma/image-2.png` |
| Placeholder card source | `96:245` | `assets/figma/placeholder-card.svg` |
| Page add | `47:297` | `assets/figma/add.svg` |
| Nav icons | `72:163`, `72:157`, `71:125`, `71:118`, `71:109` | `nav-default-active.svg`, `nav-default.svg`, `nav-netease.svg`, `nav-jinbao.svg`, `nav-wallet.svg` |
| Like/comment | `47:348`, `47:351` | `like.svg`, `comment.svg` |
| Toolbar icons | `103:279`, `75:198`, `56:81`, `56:149`, `75:192`, `57:27`, `57:39` | `tool-select.svg`, `tool-caret.svg`, `tool-add.svg`, `tool-connect.svg`, `tool-undo.svg`, `tool-zoom.svg`, `tool-fit.svg` |
| Divider/connection point | `50:391`, `96:246` | `toolbar-divider.svg`, `connection-point.svg` |

## Follow-up Round

| Requirement | Source | Status |
| --- | --- | --- |
| Page state colors and delete affordance | `129:327` | Implemented: transparent default, `rgba(56,90,223,.05)` hover, `#385ADF` selected, `20px` delete target with Figma delete SVGs |
| Page panel fill height and Minimap zoom text | `126:284` | Implemented: Page panel fills remaining left column above Minimap; Minimap shows `Now: n%` |
| Tree toggle visibility | `126:284`, `72:144` note | Implemented: only appears on `作品探索` hover/focus |
| Like state | `94:244`, `47:346` | Implemented: container remains `#EEF0F8`, active heart uses local green Figma SVG and count appears |
| Bottom selector variant assets | `103:278`, `75:194` | Implemented: select active/default assets updated from Figma, dropdown spacing adjusted |
| Fit/minimap/scrollbars | design notes | Implemented: fit computes actual canvas viewport excluding side panel and toolbar; scrollbars hidden at fit threshold; grid scales with zoom |
| Card editing and tools | user notes | Implemented in code model: editable text elements, image replacement/deletion controls, card actions, element deletion, layout toggle, drag reordering |
| Multi-select and grouping | user notes | Implemented: shift-select, drag selection, multi delete, group selected cards into a wrapping card |
| Connection interaction | user notes | Implemented: selected/dragging connection point state, temporary drag line, side-aware rounded Bezier paths |
| Loading prompt shine | user feedback | Implemented: shine now clips to text fill only, not a rectangular overlay; typewriter characters fade in smoothly |
| Bottom toolbar state correction | `157:1026`, `55:62` | Implemented: mode switch is `40x24`, icon `24x24`, arrow `12x24`, internal gap `4px`, outer gap `16px`; active select/hand assets use Figma SVGs without extra CSS inversion |
| Card action clickability | user feedback | Implemented: card and element action buttons are handled on pointer down, remain visible while hovered/selected, and element delete uses CSS-drawn cross instead of editable text |
| New image block and card titles | user feedback | Implemented: new cards include default title elements again; image blocks show a visible `待插入图片` replacement affordance |
| Top-right icon sizing | `94:244`, `47:346` | Implemented: icons render in fixed `18x18` boxes without stretching; like change uses local green heart and a small pop animation |
