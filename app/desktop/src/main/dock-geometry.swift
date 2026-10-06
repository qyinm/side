import AppKit
import ApplicationServices
import Foundation

struct DockRect: Codable {
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

struct DockGeometry: Codable {
  let accessibilityTrusted: Bool
  let orientation: String?
  let autoHide: Bool?
  let dockRect: DockRect?
}

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
  var value: CFTypeRef?
  guard AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success else {
    return nil
  }
  return value
}

func point(_ element: AXUIElement, _ name: String) -> CGPoint? {
  guard let rawValue = attribute(element, name),
        CFGetTypeID(rawValue) == AXValueGetTypeID() else {
    return nil
  }
  let value = unsafeBitCast(rawValue, to: AXValue.self)
  guard AXValueGetType(value) == .cgPoint else { return nil }
  var result = CGPoint.zero
  guard AXValueGetValue(value, .cgPoint, &result) else { return nil }
  return result
}

func size(_ element: AXUIElement, _ name: String) -> CGSize? {
  guard let rawValue = attribute(element, name),
        CFGetTypeID(rawValue) == AXValueGetTypeID() else {
    return nil
  }
  let value = unsafeBitCast(rawValue, to: AXValue.self)
  guard AXValueGetType(value) == .cgSize else { return nil }
  var result = CGSize.zero
  guard AXValueGetValue(value, .cgSize, &result) else { return nil }
  return result
}

func findDockList(in element: AXUIElement, depth: Int = 0) -> DockRect? {
  guard depth < 5 else { return nil }

  if attribute(element, kAXRoleAttribute as String) as? String == "AXList",
     let position = point(element, kAXPositionAttribute as String),
     let dimensions = size(element, kAXSizeAttribute as String),
     dimensions.width > 0,
     dimensions.height > 0 {
    return DockRect(
      x: position.x,
      y: position.y,
      width: dimensions.width,
      height: dimensions.height
    )
  }

  guard let children = attribute(element, kAXChildrenAttribute as String) as? [AXUIElement] else {
    return nil
  }
  for child in children {
    if let result = findDockList(in: child, depth: depth + 1) {
      return result
    }
  }
  return nil
}

// The host app owns permission requests. Polling this helper must stay silent.
let isTrusted = AXIsProcessTrusted()
let orientation = CFPreferencesCopyAppValue("orientation" as CFString, "com.apple.dock" as CFString) as? String
let autoHide = CFPreferencesCopyAppValue("autohide" as CFString, "com.apple.dock" as CFString) as? Bool

var dockRect: DockRect?
if isTrusted,
   let dockProcess = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.dock").first {
  dockRect = findDockList(in: AXUIElementCreateApplication(dockProcess.processIdentifier))
}

let geometry = DockGeometry(
  accessibilityTrusted: isTrusted,
  orientation: orientation,
  autoHide: autoHide,
  dockRect: dockRect
)
let encoded = try JSONEncoder().encode(geometry)
FileHandle.standardOutput.write(encoded)
FileHandle.standardOutput.write(Data([0x0A]))
