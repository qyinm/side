import AppKit

// Keep Finder coordinates in points; appdmg combines both PNGs into a Retina TIFF.
let width = 658.0
let height = 380.0
let outputDirectory = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent()
    .appendingPathComponent("resources")
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

for scale in [1, 2] {
    let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: Int(width) * scale, pixelsHigh: Int(height) * scale,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
    )!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.cgContext.scaleBy(x: CGFloat(scale), y: CGFloat(scale))

    NSGradient(starting: .white, ending: NSColor(calibratedRed: 0.95, green: 0.96, blue: 0.99, alpha: 1))!
        .draw(in: NSRect(x: 0, y: 0, width: width, height: height), angle: -90)

    func text(_ value: String, top: Double, size: Double, weight: NSFont.Weight, color: NSColor) {
        let attributes: [NSAttributedString.Key: Any] = [
            .font: NSFont.systemFont(ofSize: size, weight: weight), .foregroundColor: color,
        ]
        let string = value as NSString
        let bounds = string.size(withAttributes: attributes)
        string.draw(at: NSPoint(x: (width - bounds.width) / 2, y: height - top - bounds.height),
                    withAttributes: attributes)
    }

    text("Install Side", top: 44, size: 26, weight: .semibold,
         color: NSColor(calibratedRed: 0.15, green: 0.18, blue: 0.28, alpha: 1))
    text("Drag Side to Applications to install.", top: 86, size: 14, weight: .regular,
         color: NSColor(calibratedRed: 0.43, green: 0.46, blue: 0.54, alpha: 1))

    let arrow = NSBezierPath()
    arrow.lineWidth = 2.5
    arrow.lineCapStyle = .round
    arrow.lineJoinStyle = .round
    arrow.move(to: NSPoint(x: 304, y: height - 216))
    arrow.line(to: NSPoint(x: 354, y: height - 216))
    arrow.move(to: NSPoint(x: 344, y: height - 206))
    arrow.line(to: NSPoint(x: 354, y: height - 216))
    arrow.line(to: NSPoint(x: 344, y: height - 226))
    NSColor(calibratedRed: 0.58, green: 0.57, blue: 0.75, alpha: 1).setStroke()
    arrow.stroke()

    text("Then open Side from Applications.", top: 330, size: 12, weight: .regular,
         color: NSColor(calibratedRed: 0.51, green: 0.54, blue: 0.61, alpha: 1))

    NSGraphicsContext.restoreGraphicsState()
    let suffix = scale == 1 ? "" : "@2x"
    try bitmap.representation(using: .png, properties: [:])!
        .write(to: outputDirectory.appendingPathComponent("dmg-background\(suffix).png"))
}
