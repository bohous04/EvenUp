import ExpoModulesCore
import Vision
import UIKit

public class VisionOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VisionOcr")

    // Vision text recognition ships with iOS; there's nothing to gate at runtime,
    // but keep a hook so JS can feature-detect symmetrically with other platforms.
    Function("isAvailable") { () -> Bool in
      return true
    }

    AsyncFunction("recognize") { (base64: String, promise: Promise) in
      // Accept both a raw base64 string and a data-URL ("data:image/jpeg;base64,...").
      let payload = base64.contains(",") ? String(base64.split(separator: ",").last ?? "") : base64
      guard let data = Data(base64Encoded: payload, options: .ignoreUnknownCharacters),
            let image = UIImage(data: data),
            let cgImage = image.cgImage else {
        promise.reject("E_IMAGE", "Could not decode the image")
        return
      }

      let request = VNRecognizeTextRequest { (request, error) in
        if let error = error {
          promise.reject("E_OCR", error.localizedDescription)
          return
        }
        let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
        let lines: [[String: Any]] = observations.compactMap { obs in
          guard let candidate = obs.topCandidates(1).first else { return nil }
          let box = obs.boundingBox // normalized, origin bottom-left
          return [
            "text": candidate.string,
            "confidence": Double(candidate.confidence),
            "box": [
              "x": Double(box.origin.x),
              "y": Double(box.origin.y),
              "width": Double(box.size.width),
              "height": Double(box.size.height),
            ],
          ]
        }
        promise.resolve(lines)
      }

      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      if #available(iOS 16.0, *) {
        // Let Vision pick the best-supported language (handles cs/en receipts).
        request.automaticallyDetectsLanguage = true
      } else {
        request.recognitionLanguages = ["en-US"]
      }

      let orientation = Self.cgOrientation(from: image.imageOrientation)
      let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation, options: [:])
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try handler.perform([request])
        } catch {
          promise.reject("E_OCR", error.localizedDescription)
        }
      }
    }
  }

  private static func cgOrientation(from ui: UIImage.Orientation) -> CGImagePropertyOrientation {
    switch ui {
    case .up: return .up
    case .down: return .down
    case .left: return .left
    case .right: return .right
    case .upMirrored: return .upMirrored
    case .downMirrored: return .downMirrored
    case .leftMirrored: return .leftMirrored
    case .rightMirrored: return .rightMirrored
    @unknown default: return .up
    }
  }
}
