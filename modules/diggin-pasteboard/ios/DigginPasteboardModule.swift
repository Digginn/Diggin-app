import ExpoModulesCore
import UIKit

// SAVE-017 붙여넣기 허용 팝업 없이 클립보드를 살핀다. 내용은 사용자가 불러오기를 누른 뒤에 읽는다.
public class DigginPasteboardModule: Module {
  public func definition() -> ModuleDefinition {
    Name("DigginPasteboard")

    // 복사할 때마다 바뀐다. 같은 복사를 다시 묻지 않는 데 쓴다.
    Function("getChangeCount") {
      UIPasteboard.general.changeCount
    }

    AsyncFunction("hasWebUrlAsync") { (promise: Promise) in
      // Safari 주소 복사처럼 URL 타입으로 들어온 링크는 글자 감지에 잡히지 않는다.
      if UIPasteboard.general.hasURLs {
        promise.resolve(true)
        return
      }
      UIPasteboard.general.detectPatterns(for: [.probableWebURL]) { result in
        if case .success(let patterns) = result {
          promise.resolve(patterns.contains(.probableWebURL))
        } else {
          promise.resolve(false)
        }
      }
    }

    // 붙여넣기 설정이 '묻기'면 iOS가 사용자의 답을 받아 값을 돌려준다. 백그라운드에서 읽으면 답을 기다리지 않고 빈 값이 온다.
    AsyncFunction("readLinkTextAsync") { () -> String? in
      let pasteboard = UIPasteboard.general
      return pasteboard.string ?? pasteboard.url?.absoluteString
    }.runOnQueue(.main)
  }
}
