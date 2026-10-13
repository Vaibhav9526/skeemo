const fs = require('node:fs/promises')
const path = require('node:path')
const { createCanvas, loadImage } = require('@napi-rs/canvas')

const output = path.join(__dirname, '../assets/staffroom-illustrations')
const ink = '#252525'
const yellow = '#FFCA54'
const blue = '#427CA8'
const orange = '#D88B38'
const parts = []
let seed = 173
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 4294967296
}
const n = value => Number(value.toFixed(2))
const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const pathShape = (d, fill = 'none', color = ink, width = 1.8, extra = '') => {
  parts.push(`<path d="${d}" fill="${fill}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`)
}
const line = (x1, y1, x2, y2, color = ink, width = 1.8) => {
  const mx = (x1 + x2) / 2 + (random() - 0.5) * 2
  const my = (y1 + y2) / 2 + (random() - 0.5) * 2
  pathShape(`M ${n(x1)} ${n(y1)} Q ${n(mx)} ${n(my)} ${n(x2)} ${n(y2)}`, 'none', color, width)
}
const box = (x, y, w, h, fill = 'white', color = ink, width = 1.8) => {
  pathShape(`M ${x} ${y + 1} Q ${x + w / 2} ${y - 1.4} ${x + w} ${y} L ${x + w + 0.6} ${y + h} Q ${x + w / 2} ${y + h + 1} ${x} ${y + h} Z`, fill, color, width)
}
const text = (x, y, value, size = 22, color = ink, angle = -1) => {
  parts.push(`<text x="${x}" y="${y}" fill="${color}" font-size="${size}" font-family="Segoe Print, Comic Sans MS, cursive" transform="rotate(${angle} ${x} ${y})">${escape(value)}</text>`)
}
const ellipse = (x, y, rx, ry, fill = 'white', color = ink, width = 1.7) => {
  parts.push(`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${color}" stroke-width="${width}"/>`)
}
const group = (x, y, scale, draw) => {
  parts.push(`<g transform="translate(${x} ${y}) scale(${scale})">`)
  draw()
  parts.push('</g>')
}
const chair = (x, y, scale = 1) => group(x, y, scale, () => {
  pathShape('M -22 -34 Q -25 -58 -18 -61 L 20 -60 Q 27 -57 23 -33', 'white')
  box(-23, -34, 47, 18)
  line(-20, -17, -22, 4)
  line(21, -17, 23, 4)
  line(-18, -49, -19, -34, ink, 1)
  line(18, -49, 19, -34, ink, 1)
})
const person = (x, y, scale = 1, action = 'write') => group(x, y, scale, () => {
  chair(0, 0)
  pathShape('M -16 -28 C -25 -35 -23 -64 -12 -71 C -1 -80 16 -74 19 -61 C 23 -47 25 -31 14 -27 Z', yellow)
  ellipse(-6, -57, 1.6, 1.9, ink, ink, 0)
  ellipse(5, -58, 1.6, 1.9, ink, ink, 0)
  pathShape('M -9 -27 L -12 -13 L -7 -5 M 8 -27 L 12 -13 L 19 -8')
  if (action === 'read') {
    pathShape('M -21 -44 L -11 -30 M 20 -44 L 11 -30')
    pathShape('M -19 -37 L -1 -32 L 1 -13 L -18 -20 Z', 'white')
    pathShape('M -1 -32 L 18 -38 L 20 -21 L 1 -13 Z', 'white')
    line(-14, -31, -6, -28, blue, 1)
    line(6, -28, 14, -31, blue, 1)
  } else if (action === 'teach') {
    pathShape('M -19 -43 Q -30 -35 -33 -41 M 19 -46 L 37 -64 L 55 -91')
    line(55, -91, 66, -104, ink, 1.3)
  } else {
    pathShape('M -19 -43 Q -23 -24 -34 -18 M 19 -42 Q 30 -30 33 -18')
  }
})
const desk = (x, y, w = 86, h = 39) => {
  pathShape(`M ${x} ${y} L ${x + w - 6} ${y - 2} L ${x + w + 5} ${y + h - 6} L ${x - 5} ${y + h} Z`, 'white')
  line(x - 5, y + h, x - 5, y + h + 8)
  line(x - 5, y + h + 8, x + w + 5, y + h + 3)
  line(x + w + 5, y + h - 6, x + w + 5, y + h + 3)
  line(x + 2, y + h + 8, x + 1, y + h + 25)
  line(x + w - 2, y + h + 4, x + w - 1, y + h + 22)
}
const notebook = (x, y, scale = 1) => group(x, y, scale, () => {
  pathShape('M 0 0 L 24 -2 L 29 15 L 3 17 Z', 'white')
  line(7, 5, 20, 4, blue, 1)
  line(9, 10, 21, 9, blue, 1)
  line(28, 1, 37, 12, ink, 1.2)
})
const mug = (x, y) => {
  pathShape(`M ${x} ${y} L ${x + 1} ${y + 13} Q ${x + 7} ${y + 17} ${x + 13} ${y + 12} L ${x + 13} ${y} Z`, 'white')
  pathShape(`M ${x + 13} ${y + 3} C ${x + 24} ${y} ${x + 24} ${y + 13} ${x + 14} ${y + 10}`)
  pathShape(`M ${x + 4} ${y - 5} Q ${x} ${y - 11} ${x + 5} ${y - 17}`, 'none', ink, 1)
}
const plant = (x, y, scale = 1) => group(x, y, scale, () => {
  pathShape('M -13 -22 L 12 -22 L 8 0 L -8 0 Z', 'white')
  pathShape('M 0 -22 Q -4 -40 1 -59 M -1 -31 Q -23 -46 -18 -55 Q -1 -51 -1 -31 M 0 -39 Q 20 -57 24 -49 Q 18 -36 0 -39 M 0 -48 Q -10 -67 -5 -69 Q 7 -60 0 -48', 'white')
})
const shelf = (x, y, w = 118) => {
  box(x, y, w, 68)
  for (const row of [5, 34]) {
    let cursor = x + 7
    while (cursor < x + w - 13) {
      const width = 6 + Math.floor(random() * 7)
      const height = 17 + Math.floor(random() * 8)
      box(cursor, y + row + 25 - height, width, height, random() > 0.86 ? yellow : 'white', ink, 1)
      cursor += width + 3
    }
    line(x + 3, y + row + 27, x + w - 3, y + row + 27, ink, 1.3)
  }
  line(x + 4, y + 68, x + 4, y + 77)
  line(x + w - 4, y + 68, x + w - 4, y + 77)
}
const roomWall = (x, y, w, h, doorStart, doorWidth) => {
  pathShape(`M ${x} ${y + h} L ${x - 1} ${y} Q ${x + w / 2} ${y - 2} ${x + w} ${y} L ${x + w} ${y + h}`)
  line(x + 5, y + h - 3, x + 5, y + 6, ink, 0.8)
  line(x + 5, y + 6, x + w - 5, y + 5, ink, 0.8)
  line(x, y + h, doorStart, y + h)
  line(doorStart + doorWidth, y + h, x + w, y + h)
  line(doorStart, y + h, doorStart + 10, y + h - doorWidth, ink, 1.1)
  pathShape(`M ${doorStart + 10} ${y + h - doorWidth} Q ${doorStart + doorWidth} ${y + h - doorWidth} ${doorStart + doorWidth} ${y + h}`, 'none', blue, 1, 'stroke-dasharray="3 5"')
}

parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-labelledby="title description">')
parts.push('<title id="title">A little school, drawn by hand</title><desc id="description">A white-background hand-drawn school floor layout. The principal sits in a private office at upper left. Below, a librarian sits reading behind the library desk surrounded by bookshelves. The central staffroom has seated staff at a shared table and a tea corner. At right, a seated teacher faces six students, each on a chair at their own desk. An open corridor connects all four rooms. Characters are yellow bean-shaped Xiaohei figures with black dot eyes.</desc>')
parts.push('<rect width="1600" height="900" fill="white"/>')

roomWall(173, 198, 316, 198, 385, 53)
roomWall(173, 437, 316, 216, 389, 53)
roomWall(531, 198, 382, 455, 808, 63)
roomWall(956, 198, 453, 455, 976, 63)
text(195, 177, 'principal’s office', 24)
text(201, 423, 'library', 24, blue, 1)
text(643, 175, 'staffroom', 29)
text(1125, 174, 'classroom', 27, blue)

box(204, 220, 81, 43)
line(244, 220, 245, 263, ink, 1)
line(204, 241, 285, 240, ink, 1)
plant(450, 266, 0.65)
person(338, 304, 0.79)
desk(283, 290, 104, 43)
notebook(299, 305, 0.75)
mug(357, 295)
chair(308, 377, 0.59)
chair(362, 377, 0.59)
text(215, 359, 'knock first', 14, orange, -3)

shelf(190, 454, 119)
shelf(322, 454, 141)
person(347, 598, 0.77, 'read')
desk(294, 587, 107, 34)
notebook(310, 596, 0.7)
box(368, 590, 20, 7, yellow, ink, 1)
box(366, 583, 20, 7, 'white', ink, 1)
text(199, 588, 'one more', 15, blue, -4)
text(207, 607, 'chapter…', 15, blue, -3)
pathShape('M 274 592 Q 286 585 295 566', 'none', blue, 1.2)

box(556, 218, 84, 57)
line(556, 247, 640, 246, ink, 1)
line(598, 219, 598, 275, ink, 1)
plant(879, 285, 0.8)
box(673, 218, 124, 63)
pathShape('M 687 232 L 708 230 L 709 248 L 686 248 Z', 'white', ink, 1)
pathShape('M 724 240 L 746 238 L 748 258 L 723 258 Z', 'white', ink, 1)
line(762, 237, 780, 236, blue, 1.3)
line(762, 246, 780, 245, blue, 1.3)
line(763, 255, 776, 254, blue, 1.3)
person(653, 414, 0.85, 'read')
person(763, 414, 0.85)
desk(600, 407, 219, 71)
notebook(730, 427, 1)
notebook(625, 424, 0.9)
mug(683, 422)
chair(657, 523, 0.8)
chair(766, 523, 0.8)
box(558, 560, 127, 40)
line(564, 601, 564, 617)
line(678, 601, 678, 617)
mug(617, 567)
pathShape('M 575 559 L 574 537 Q 587 530 599 538 L 599 558 Z', 'white')
pathShape('M 599 541 Q 617 542 608 553 L 600 551')
text(570, 641, 'tea & ideas', 17, orange, -2)

box(1061, 218, 237, 62, 'white', ink, 2)
text(1080, 257, 'a small question → big ideas', 14, blue, 0)
line(1077, 265, 1279, 264, ink, 0.7)
person(1177, 353, 0.73, 'teach')
desk(1134, 344, 91, 28)
notebook(1149, 354, 0.6)
const seats = []
for (const y of [452, 571]) {
  for (const x of [1059, 1180, 1301]) {
    person(x, y, 0.69)
    desk(x - 39, y - 7, 78, 31)
    notebook(x - 22, y + 1, 0.7)
    seats.push({ x, y })
  }
}
plant(1373, 277, 0.65)

pathShape('M 173 681 Q 620 685 880 680 Q 1120 677 1409 681', 'none', ink, 1.1)
text(694, 730, 'a shared corridor', 19, orange, 0)
pathShape('M 829 706 Q 861 686 888 674', 'none', orange, 1.3)
pathShape('M 880 672 L 889 674 L 884 682', 'none', orange, 1.3)
line(174, 681, 174, 704, ink, 1)
line(1409, 681, 1409, 704, ink, 1)
text(590, 811, 'Room to teach. Room to think.', 24, ink, -1)
parts.push('</svg>')

async function main() {
  const svg = parts.join('\n')
  await fs.mkdir(output, { recursive: true })
  const svgPath = path.join(output, '01-school-staffroom-layout.svg')
  const pngPath = path.join(output, '01-school-staffroom-layout.png')
  await fs.writeFile(svgPath, svg)
  const image = await loadImage(Buffer.from(svg))
  const canvas = createCanvas(1600, 900)
  canvas.getContext('2d').drawImage(image, 0, 0)
  await fs.writeFile(pngPath, canvas.toBuffer('image/png'))
  if (seats.length !== 6) throw new Error('Classroom must contain six seated students')
  console.log(`Created 1600 × 900 SVG and PNG with four rooms and ${seats.length} seated students.\n${svgPath}\n${pngPath}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
