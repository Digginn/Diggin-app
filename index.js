import "expo";
// 다른 화면 코드보다 먼저 불러와야 Text·TextInput이 배율을 끈 버전으로 쓰인다(BUG-105).
import "./src/lib/disableFontScaling";
import "expo-router/entry";
