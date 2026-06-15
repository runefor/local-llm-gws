# 구글 클라우드 플랫폼(GCP) OAuth 2.0 설정 가이드

본 문서는 앱에서 Gmail 및 Google Drive API를 호출하기 위해 필요한 구글 API 자격증명(Credentials)을 획득하고 프로젝트에 설정하는 절차를 안내합니다.

---

## 1. Google Cloud 프로젝트 생성 및 API 활성화

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속하여 구글 계정으로 로그인합니다.
2. 상단 프로젝트 선택 드롭다운에서 **[새 프로젝트 (New Project)]**를 클릭하고 프로젝트 이름을 입력하여 생성합니다.
3. 왼쪽 메뉴에서 **API 및 서비스(APIs & Services) > 라이브러리(Library)**로 이동합니다.
4. 다음 두 API를 검색하여 각각 **[사용 (Enable)]**을 클릭합니다:
   * **Gmail API**
   * **Google Drive API**

---

## 2. OAuth 동의 화면 구성 (OAuth Consent Screen)

데스크톱 앱에서 사용자가 구글 로그인을 하기 위해 동의 화면 구성이 필요합니다.

1. **API 및 서비스 > OAuth 동의 화면(OAuth Consent Screen)** 메뉴로 이동합니다.
2. User Type을 **외부 (External)**로 선택하고 **[만들기 (Create)]**를 클릭합니다.
   * *주: G Suite / Google Workspace 조직 내부에서만 사용하는 경우 '내부 (Internal)'로 선택해도 무방합니다.*
3. **앱 정보**를 입력합니다:
   * 앱 이름 (예: `GWS Knowledge Extractor`)
   * 사용자 지원 이메일
   * 개발자 연락처 정보
4. **범위 (Scopes)** 단계는 추가 설정 없이 넘어가거나, 필요 시 아래 범위를 미리 추가할 수 있습니다:
   * `https://www.googleapis.com/auth/gmail.readonly` (Gmail 읽기 권한)
   * `https://www.googleapis.com/auth/drive.readonly` (구글 드라이브 파일 읽기 권한)
5. **테스트 사용자 (Test Users)** 단계에서 매우 중요합니다:
   * 개발 중 동의 화면이 "테스트" 상태일 때는 등록된 사용자만 로그인할 수 있습니다.
   * **[Add Users]**를 클릭해 로그인 테스트에 사용할 자신의 구글 계정 이메일을 반드시 추가합니다.
6. 저장을 완료합니다.

---

## 3. OAuth 2.0 클라이언트 자격증명 생성 및 다운로드

1. **API 및 서비스 > 사용자 인증 정보(Credentials)** 메뉴로 이동합니다.
2. 상단의 **[+ 사용자 인증 정보 만들기 (Create Credentials)] > OAuth 클라이언트 ID(OAuth client ID)**를 선택합니다.
3. 애플리케이션 유형(Application type)을 **데스크톱 앱 (Desktop App)**으로 선택합니다.
4. 이름을 입력하고(예: `GWS Desktop Client`) **[만들기 (Create)]**를 클릭합니다.
5. 생성된 클라이언트 정보 팝업에서 **[JSON 다운로드 (Download JSON)]** 아이콘을 클릭하여 자격증명 파일을 컴퓨터에 다운로드합니다.

---

## 4. 다운로드한 JSON 설정

1. 다운로드한 파일의 이름을 **`client_secrets.json`**으로 변경합니다.
2. 이 파일을 프로젝트의 **`python-backend/data/`** 폴더에 배치합니다.
   * *주: 포터블 정책에 따라 설정 파일들은 모두 `./data/` 하위에서 보관 및 관리됩니다.*

```text
local-llm-gws/
└── python-backend/
    └── data/
        └── client_secrets.json   <-- 여기에 배치합니다!
```

---

## 5. 최초 로그인 시나리오

1. Tauri 앱을 실행한 후 **Gmail 동기화** 또는 **Drive 동기화** 버튼을 클릭하면 백엔드가 브라우저를 열어 구글 로그인 화면을 표시합니다.
2. 2단계에서 등록했던 테스트 사용자 계정으로 로그인한 뒤, "안전하지 않은 앱" 경고가 나타나면 **고급 > 이동(안전하지 않음)**을 눌러 동의를 수락합니다.
3. 성공적으로 동의하면 `./data/token.json` 파일이 자동 생성되며, 이후에는 로그인 창 없이 백그라운드에서 자동 연동이 유지됩니다.
