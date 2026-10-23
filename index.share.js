// 앱의 expo-router/entry처럼 Expo 런타임(URL 등 웹 표준 API)을 먼저 준비한다. 없으면 supabase가 URL에서 실패한다.
import "expo";
// 다른 화면 코드보다 먼저 불러와야 Text·TextInput이 배율을 끈 버전으로 쓰인다.
import "./src/share/disableFontScaling";
import { AppRegistry } from "react-native";

import ShareExtension from "./src/share/ShareExtension";

import "./src/global.css";

// 첫 인자는 expo-share-extension이 찾는 이름이라 바꾸면 안 된다.
AppRegistry.registerComponent("shareExtension", () => ShareExtension);
