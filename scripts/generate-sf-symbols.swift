import AppKit
import Foundation

struct SymbolAsset {
  let fileName: String
  let symbolName: String
  let weight: NSFont.Weight
}

let symbols = [
  SymbolAsset(fileName: "arrow-up", symbolName: "arrow.up", weight: .semibold),
  SymbolAsset(fileName: "arrow-up-right", symbolName: "arrow.up.right", weight: .semibold),
  SymbolAsset(
    fileName: "checkmark-circle-fill", symbolName: "checkmark.circle.fill", weight: .regular),
  SymbolAsset(fileName: "chevron-down", symbolName: "chevron.down", weight: .semibold),
  SymbolAsset(fileName: "chevron-left", symbolName: "chevron.left", weight: .semibold),
  SymbolAsset(fileName: "chevron-right", symbolName: "chevron.right", weight: .semibold),
  SymbolAsset(fileName: "chevron-up", symbolName: "chevron.up", weight: .semibold),
  SymbolAsset(fileName: "chevron-up-down", symbolName: "chevron.up.chevron.down", weight: .regular),
  SymbolAsset(fileName: "compose", symbolName: "square.and.pencil", weight: .regular),
  SymbolAsset(fileName: "doc-fill", symbolName: "doc.fill", weight: .regular),
  SymbolAsset(fileName: "envelope-fill", symbolName: "envelope.fill", weight: .regular),
  SymbolAsset(fileName: "face-smiling", symbolName: "face.smiling", weight: .regular),
  SymbolAsset(fileName: "filter", symbolName: "line.3.horizontal.decrease", weight: .regular),
  SymbolAsset(fileName: "folder-fill", symbolName: "folder.fill", weight: .regular),
  SymbolAsset(fileName: "gearshape-fill", symbolName: "gearshape.fill", weight: .regular),
  SymbolAsset(fileName: "gearshape", symbolName: "gearshape", weight: .regular),
  SymbolAsset(
    fileName: "hand-thumbsdown-fill", symbolName: "hand.thumbsdown.fill", weight: .regular),
  SymbolAsset(fileName: "hand-thumbsup-fill", symbolName: "hand.thumbsup.fill", weight: .regular),
  SymbolAsset(fileName: "heart-fill", symbolName: "heart.fill", weight: .regular),
  SymbolAsset(fileName: "link", symbolName: "link", weight: .regular),
  SymbolAsset(fileName: "location-fill", symbolName: "location.fill", weight: .regular),
  SymbolAsset(fileName: "lock-fill", symbolName: "lock.fill", weight: .regular),
  SymbolAsset(fileName: "magnifyingglass", symbolName: "magnifyingglass", weight: .regular),
  SymbolAsset(fileName: "person-2-fill", symbolName: "person.2.fill", weight: .regular),
  SymbolAsset(fileName: "person-fill", symbolName: "person.fill", weight: .regular),
  SymbolAsset(
    fileName: "person-crop-circle-fill", symbolName: "person.crop.circle.fill", weight: .regular),
  SymbolAsset(fileName: "pause-fill", symbolName: "pause.fill", weight: .regular),
  SymbolAsset(fileName: "phone-fill", symbolName: "phone.fill", weight: .regular),
  SymbolAsset(fileName: "play-fill", symbolName: "play.fill", weight: .regular),
  SymbolAsset(fileName: "plus", symbolName: "plus", weight: .medium),
  SymbolAsset(fileName: "plus-circle-fill", symbolName: "plus.circle.fill", weight: .regular),
  SymbolAsset(
    fileName: "rectangle-stack-fill", symbolName: "rectangle.on.rectangle.fill", weight: .regular),
  SymbolAsset(fileName: "sparkles", symbolName: "sparkles", weight: .regular),
  SymbolAsset(fileName: "video", symbolName: "video", weight: .regular),
  SymbolAsset(fileName: "video-fill", symbolName: "video.fill", weight: .regular),
  SymbolAsset(fileName: "waveform", symbolName: "waveform", weight: .regular),
  SymbolAsset(fileName: "xmark", symbolName: "xmark", weight: .medium),
  SymbolAsset(fileName: "xmark-circle-fill", symbolName: "xmark.circle.fill", weight: .regular),
]

let fileManager = FileManager.default
let repositoryRoot = URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true)
let outputDirectory = repositoryRoot.appendingPathComponent(
  "src/public/sf-symbols", isDirectory: true)
try fileManager.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

let canvasSize = NSSize(width: 128, height: 128)
let symbolPointSize: CGFloat = 72

for asset in symbols {
  let configuration = NSImage.SymbolConfiguration(pointSize: symbolPointSize, weight: asset.weight)
    .applying(NSImage.SymbolConfiguration(hierarchicalColor: .white))
  guard
    let baseImage = NSImage(systemSymbolName: asset.symbolName, accessibilityDescription: nil),
    let symbolImage = baseImage.withSymbolConfiguration(configuration)
  else {
    throw NSError(
      domain: "GenerateSFSymbols",
      code: 1,
      userInfo: [NSLocalizedDescriptionKey: "SF Symbol is unavailable: \(asset.symbolName)"]
    )
  }

  let renderedImage = NSImage(size: canvasSize, flipped: false) { canvas in
    NSColor.clear.setFill()
    canvas.fill()
    let symbolSize = symbolImage.size
    let drawingRect = NSRect(
      x: (canvas.width - symbolSize.width) / 2,
      y: (canvas.height - symbolSize.height) / 2,
      width: symbolSize.width,
      height: symbolSize.height
    )
    symbolImage.draw(in: drawingRect)
    return true
  }

  guard
    let tiffData = renderedImage.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiffData),
    let pngData = bitmap.representation(using: .png, properties: [:])
  else {
    throw NSError(
      domain: "GenerateSFSymbols",
      code: 2,
      userInfo: [NSLocalizedDescriptionKey: "Unable to render SF Symbol: \(asset.symbolName)"]
    )
  }

  try pngData.write(
    to: outputDirectory.appendingPathComponent("\(asset.fileName).png"), options: .atomic)
}

print("Generated \(symbols.count) SF Symbol assets in \(outputDirectory.path)")
