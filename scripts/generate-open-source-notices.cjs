/* global __dirname */
const { readFileSync, readdirSync, existsSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json"), "utf8"));
const notices = new Map();

// 설치된 배포 의존성과 앱에 번들하는 Pretendard 폰트의 고지문을 보관한다.
for (const [location, entry] of Object.entries(lock.packages)) {
  if (!location || (entry.dev && location !== "node_modules/pretendard")) continue;
  const directory = path.join(root, location);
  const manifestPath = path.join(directory, "package.json");
  // 다른 운영체제용 optional 패키지는 현재 설치에 없을 수 있다.
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const key = `${manifest.name}@${manifest.version}`;
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((file) => file.isFile() && /^(licen[sc]e|copying|notice)([.-]|$)/i.test(file.name))
    .map((file) => ({
      name: file.name,
      text: readFileSync(path.join(directory, file.name), "utf8").trim(),
    }));
  const license = manifest.license ?? entry.license;
  const notice = {
    name: manifest.name,
    version: manifest.version,
    license: typeof license === "string" ? license : (license?.type ?? "미표기"),
    notices: files,
  };
  if (!notices.has(key) || files.length > notices.get(key).notices.length) notices.set(key, notice);
}

const output = [...notices.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(
  path.join(root, "src/screens/my/constants/openSourceLicenses.json"),
  JSON.stringify(output, null, 2) + "\n",
);
console.log(`${output.length}개 패키지의 라이선스 정보 생성 완료`);
