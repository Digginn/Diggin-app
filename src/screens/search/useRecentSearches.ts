import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const STORAGE_KEY = "recent-searches";
const MAX_COUNT = 10;

/**
 * 최근 검색어를 기기에 저장한다. 계정이 아니라 기기 기준이라 앱을 지우면 함께 사라진다.
 * 서버로 옮길 일이 생기면 이 훅 안만 바꾸면 된다.
 */
export function useRecentSearches() {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const parsed = raw ? JSON.parse(raw) : null;
        if (Array.isArray(parsed)) setKeywords(parsed.filter((item) => typeof item === "string"));
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // 읽기 전에 저장하면 빈 목록으로 덮어쓴다. 저장 실패는 무시한다.
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(keywords)).catch(() => {});
  }, [keywords, loaded]);

  return {
    keywords,
    add: (keyword: string) =>
      setKeywords((prev) =>
        [keyword, ...prev.filter((item) => item !== keyword)].slice(0, MAX_COUNT),
      ),
    remove: (keyword: string) => setKeywords((prev) => prev.filter((item) => item !== keyword)),
    clear: () => setKeywords([]),
  };
}
