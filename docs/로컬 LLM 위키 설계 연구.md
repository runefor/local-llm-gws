# **로컬 하이브리드 RAG와 LLM Wiki 융합 기반의 고성능 개인 지식 시스템 아키텍처 및 구현 기술 보고서**

## **LLM Wiki의 역할 정의 및 설계 철학**

개인 데스크톱 환경에서 파편화된 Gmail 메시지와 Google Drive 문서를 활용하여 영구적이고 가치 있는 지식 축적층을 구축하기 위해서는 정보 처리 구조의 고도화가 요구된다1. 기존의 단순 검색 증강 생성(RAG) 아키텍처는 매 검색 요청 시마다 비정형 데이터 원문에서 무상태(Stateless) 형태로 일시적인 지식을 합성하므로, 세션이 종료되는 즉시 모델이 획득한 맥락과 연결 고리가 소실되는 치명적인 한계를 노출한다1.  
이러한 망각 현상을 해결하기 위해 고안된 구조가 바로 엘엘엠 위키(LLM Wiki) 패턴이다2. LLM Wiki는 단순히 정적인 텍스트 요약을 나열하는 저장소가 아니며, 원천 데이터가 유입될 때마다 스스로 개념 간의 유기적인 결합 관계를 인지하고 상호 텍스트 링크(\[\[wiki-links\]\])를 구성하여 지속적으로 진화하는 유상태(Stateful)의 지식 구조체 역할을 수행한다1.

### **개인 지식 관리 시스템 및 기술 패러다임 비교**

로컬 환경에서 구동 가능한 핵심 지식 관리 플랫폼들의 기술적 특성을 규명하기 위해 지식의 상태성, 갱신 제어권, 관계성 표현 한계 등을 대조 분석한다1.

| 비교 차원 | 전통적 RAG 시스템 | 인간 중심 로컬 노트 앱 (Obsidian) | 지식 그래프 데이터베이스 | LLM Wiki (본 시스템 설계) |
| :---- | :---- | :---- | :---- | :---- |
| **지식 표현의 상태성** | 무상태성 (매 질의 시 임시로 조립 후 망각)1 | 상태성 (인간의 장기 기억으로 로컬 보존)1 | 상태성 (노드 및 에지 형태의 고정 정형망)7 | 상태성 (AI가 자동 편집하고 인간이 승인하는 마크다운 파일)1 |
| **관계 매핑 방식** | 코사인 유사도 기반 벡터 근접도 검색7 | 사람이 직접 명시한 정적 내부 링크 연계1 | 온톨로지 규칙에 부합하는 명시적 관계 정의7 | AI가 합성한 의미론적 링크 및 상호참조 정의1 |
| **데이터 소유권 및 프라이버시** | 외부 클라우드 의존성 높음 (SaaS 위주) | 완전한 로컬 소유권 (로컬 파일)1 | 로컬 구동 가능하나 스키마 구축이 까다로움7 | 완전한 로컬-퍼스트 구동 및 이력 관리 보장1 |
| **다중 도약 추론 능력 (Multi-hop)** | 극도로 취약함 (중간 매개 정보 누락 시 실패)13 | 인간의 연상 능력에 의존 | 매우 우수함 (그래프 에지 탐색 추적)7 | 우수함 (구조화 마크다운 링크 탐색 지원)2 |
| **유지 관리 오버헤드** | 없음 (완전 기계적 자동 인덱싱) | 매우 높음 (정리 지연 시 정리 파탄 발생)1 | 높음 (개념 확장 시 스키마 변경 필요)7 | 매우 낮음 (AI가 작성하고 linter가 유지보수)1 |

### **원문 검색층과 위키 정리층의 물리적 이원화**

본 보고서에서 제안하는 아키텍처의 중추적 골자는 "원문 검색층(RAG)"과 "Wiki 정리층(LLM Wiki)"의 물리적 및 논리적 분리이다1. 원문 검색층은 사용자의 Gmail 함 및 Google Drive 원천 데이터를 가공하지 않고 원형 그대로 인덱싱하는 영구적 불변성(Immutability) 영역이다1. 반면 Wiki 정리층은 사용자가 수동으로 선택하여 승인한 신뢰할 수 있는 사실 정보인 근거 데이터셋(Evidence Set)만을 통과시켜 지식의 정제도를 극적으로 높이는 필터링 영역이다1.  
이러한 이원화 아키텍처는 명확한 성능상 우위를 가짐과 동시에 몇 가지 잠재적 위험 요소를 수반하므로 구조적 대응 방안을 함께 마련해야 한다.  
원문 검색층과 위키 정리층을 분리함으로써 얻을 수 있는 기술적 장점은 다음과 같다.  
첫째, 원천 데이터 보존 및 무손실 추적성이 극대화된다1. 사용자가 위키 내용을 열람하는 과정에서 개별 팩트의 신뢰성에 의문이 생길 때, 지식 합성 과정에서 유실되기 쉬운 이메일 원문 고유 식별자(Gmail Message ID)나 실제 구글 드라이브 파일의 세부 좌표로 즉각 하이퍼링크 백트래킹을 수행할 수 있다1.  
둘째, 환각 전파 차단 가드레일이 견고해진다1. 로컬 환경에서 소형 언어 모델을 구동할 경우 비정형 원천 문서 전체를 무차별적으로 요약하도록 방치하면 모호한 표현이나 스팸성 텍스트까지 왜곡 가공하여 지식층에 병합한다1. 선택된 근거 데이터셋만 위키 생성용 컨텍스트로 한정함으로써 거짓 정보의 재생산을 통제할 수 있다1.  
셋째, 로컬 연산 자원을 고도로 절약할 수 있다2. 원천 이메일이나 문서 전체를 실시간으로 모니터링하여 전체 요약 프로세스를 실행할 필요가 없으므로 데스크톱 백그라운드의 CPU 및 GPU 전력 점유율을 최적으로 관리할 수 있다14.  
반면, 이러한 이원화 구조를 가동할 때 노출될 수 있는 아키텍처적 위험 요인과 엔지니어링 대책은 다음과 같이 정리된다.  
첫째, 원문 수정 시 발생하는 동기화 지연 및 정합성 불일치 위험이 있다1. 예를 들어 구글 드라이브 상의 기획서 파일이 업데이트되었음에도 사용자가 이미 컴파일해 버린 위키 노드는 과거의 근거 데이터셋 버전에 고착될 수 있다1.  
이 문제를 해결하기 위해 위키 노드의 메타데이터 영역에 원천 소스의 파일 수정 타임스탬프와 해시값을 엄격히 바인딩하고, 앱 기동 시 혹은 정기 백그라운드 작업으로 원천 파일 정보와 대조하여 차이가 발생하는 위키 페이지에 'Stale' 플래그를 표기해 두어야 한다1.  
둘째, 잘못된 병합으로 인한 위키 오염 및 오류 누적 위험이 존재한다1. 인공지능 모델이 새로운 근거를 병합할 때 기존 정보와 모순되는 내용을 검출하지 못하고 나란히 기재하거나 덮어써 버릴 수 있다1.  
이에 대한 해법으로 병합 프로세스 수행 전 기존 위키 파일과 신규 후보 정보를 먼저 분석하고 변경 전후의 의미론적 모순을 정적 린터(Linter) 단계에서 가려낸 뒤, 충돌이 확인될 시 사용자가 최종 진실(Ground Truth)을 판단할 수 있도록 사용자 인터페이스(UI) 단에서 충돌 해소용 디퓨저(Conflict Resolver)를 의무적으로 경유하게 설계해야 한다1.

### **원문을 대체하지 않으면서 검색 품질을 견인하는 융합 인덱스 토폴로지**

위키는 원본 문서를 가리고 대체하는 파괴적 레이어가 아니며, 파편화된 원본들의 의미론적 좌표를 단단히 매어주는 앵커링 카탈로그이다5. 위키의 존재로 인해 검색 능력이 비약적으로 상승하는 핵심 메커니즘은 다음과 같다.  
사용자가 질의어를 던졌을 때 검색기는 이메일 본문 청크만 뒤지는 것이 아니라, 고도로 의미가 축약되고 엔티티 간의 관계가 기재되어 있는 wiki/ 마크다운 디렉터리를 먼저 교차 탐색한다1. 위키 페이지는 그 자체로 특정 프로젝트의 일정, 핵심 주체, 주요 의사결정의 역사가 응집되어 있는 고부가가치 요약 콘텍스트 파일이다1.  
따라서 사용자가 "세종 프로젝트 일정"이라고 불완전하게 검색했을 때, 수만 개의 관련 메일 파편을 정렬하는 것보다 이미 잘 링크된 세종 프로젝트 위키 노드와 그 노드가 가리키는 Gmail 원문 식별자 앵커링 링크들을 동시에 추적하여 화면에 한데 모아 바인딩해 주는 것이 정보 회수율(Recall) 측면에서 완벽히 유용하다1.

## **로컬 하드웨어 제약 기반 고성능 검색 및 생성 구조**

로컬 데스크톱(특히 데스크톱 GPU 단독 구동 혹은 Apple Silicon 통합 메모리 환경)에서 ![][image1] 규모의 경량 언어 모델을 운용할 때는 극단적인 자원 효율화 기법과 안정화 파이프라인이 전제되어야 시스템이 연산 지연 없이 매끄럽게 작동한다18.

### **경량 로컬 임베딩과 크로스 엔코더 재정렬 최적 조합**

로컬 시스템에서 무거운 연산 모델들을 함부로 조합해 구동하면 메모리 스와핑(Memory Swapping)이 발생하여 전체 운영체제의 레이턴시가 붕괴된다18. 이를 방어하기 위해 이중 레이어 검색 기법을 구축한다13.

\[사용자 입력 쿼리\]   
       │  
       ├─────────────────────────────────┐  
       ▼                                 ▼  
\[BM25 Sparse Retrieval\]       \[Dense Vector Retrieval\]  
 (영단어/ID 완전 일치 필터링)    (bge-m3 모델 활용, CPU 위임 가동)  
       │                                 │  
       └────────────────┬────────────────┘  
                        ▼  
         \[Reciprocal Rank Fusion (RRF)\]  
           (상수 k=60 가중 가산 융합)  
                        ▼  
      \[BGE-Reranker-Lite Cross-Encoder\]  
     (상위 15개 후보 선별 정밀 비교 정렬)

dense 벡터 검색에는 bge-m3 또는 all-MiniLM-L6-v2와 같은 300MB\~1GB 미만의 최적화 임베딩 모델을 적용하되, 임베딩 연산 전반은 GPU가 아닌 CPU 멀티쓰레드로 가동하도록 물리적으로 격리 설정한다18. 이는 임베딩 데이터의 지속적인 인입 과정에서 로컬 GPU 가속 장치가 고착(Hang)을 일으켜 UI 렌더링 스레드가 멈추는 데스크톱 고유의 병목을 방지하기 위함이다18.  
이메일 주소, 날짜, 문서 번호와 같은 렉시컬(Lexical) 일치는 BM25 가중 알고리즘을 사용해 SQLite 또는 ChromaDB 하이브리드 엔진 내에서 병렬 검색되도록 보장한다13. 두 회수기에서 도출된 이질적인 스코어 값은 순위 정보만을 순수하게 합산하여 왜곡을 없애는 역순위 융합(Reciprocal Rank Fusion, RRF) 공식에 대입한다13.  
![][image2]  
RRF 연산의 안정성을 담보하기 위한 정적 보정값 ![][image3]는 일반적인 기준인 60으로 할당하고, 상위 후보들을 정렬한다23. 이렇게 병합된 상위 15\~20개의 청크 후보군을 대상으로만 cross-encoder/ms-marco-MiniLM-L-6-v2 모델을 로컬에서 순간 가동하여 최종 5\~6개 핵심 청크로 필터링하는 2차 재정렬(Reranking)을 시행한다18.  
이러한 로컬-퍼스트 분리 배치는 추론 비용을 극단적으로 낮추는 한편, 렉시컬 정확도와 시맨틱 맥락을 모두 수렴할 수 있는 실전형 구조이다13.

### **맥락 제한 및 환각 제어를 위한 맵-리듀스 컴파일 기법**

로컬 LLM의 장기 콘텍스트 처리 한계를 회피하기 위해 단일 대형 프롬프트에 모든 선택 문서를 밀어 넣는 방식은 완벽히 지양해야 한다18. 긴 메일 대화 타임라인이나 방대한 PDF 문서에서 사용자가 선택한 근거 데이터셋이 수 만 토큰에 이르는 경우, 시스템은 다음과 같이 맵-리듀스(Map-Reduce)형 축약 파이프라인을 기동한다1.

\[원문 문서 리스트 (Gmail Threads / Drive PDF)\]  
                         │  
                         ▼  
             \[1단계: 적응형 Chunking\]  
        (헤더 및 타임라인 기준 구조적 분할)  
                         │  
                         ▼  
          \[2단계: Map (개별 청크 단위 요약)\]  
       (로컬 LLM을 통한 단문 팩트/엔티티 추출)  
                         │  
                         ▼  
        \[3단계: Reduce (지식 합성 및 컴파일)\]  
   (추출된 요약 세트를 병합하여 Wiki 마크다운 생성)

* **Map 단계**: 각 파일에서 추출된 청크 단위마다 로컬 LLM이 구조적 단문 팩트 요약과 등장 엔티티 리스트를 1차로 독립 추출하여 가벼운 JSON 아티팩트로 압축한다27.  
* **Reduce 단계**: 1차 가공된 요약 JSON 정보들만을 정제 결합하여 최종 목표 마크다운 위키 파일인 wiki/ 노드에 병합한다1.

이 과정에서 KV 캐시가 물리 메모리를 침범하여 연산 속도가 무너지는 현상을 제어하기 위해, Ollama의 num\_ctx 한계 수치를 명시적으로 8192 토큰 영역으로 고정하고 초과 입력 시점에 대해서는 자동으로 슬라이딩 윈도우 파티셔닝을 실행하는 가드레일을 둔다18.

## **Gmail 및 Google Drive 특화 데이터 모델 및 지식 매핑**

Gmail과 Google Drive 비정형 문서는 구조가 불규칙하고 이형적인 성격이 매우 강하다13. 따라서 이들을 정규화하여 정밀한 관계망으로 직조하는 논리 설계가 선행되어야 한다27.

### **복합 정형 지식 스키마 정의 및 개체 관계도**

본 시스템은 상호 의미 링크를 고도로 표현할 수 있는 그래프 지향형 데이터 매핑 스키마를 구성한다6. 이를 위해 로컬 SQLite 및 ChromaDB를 동시에 점유하는 하이브리드 관계 설계를 도입한다1.

┌────────────────────────────────────────────────────────┐  
│                      raw\_sources                       │  
│  (Gmail Message, Drive File, Document Metadata)        │  
└───────────────────────────┬────────────────────────────┘  
                            │ (1 : N)  
                            ▼  
┌────────────────────────────────────────────────────────┐  
│                    wiki\_citations                      │  
│  (정확한 텍스트 스니펫, 좌표 및 소스 매핑 정보 보존)       │  
└───────────────────────────┬────────────────────────────┘  
                            │ (N : 1\)  
                            ▼  
┌────────────────────────────────────────────────────────┐  
│                      wiki\_nodes                        │  
│  (PROJECT, PERSON, ORGANIZTION, DECISION 등의 마크다운 노드)│  
└───────────────────────────┬────────────────────────────┘  
                            │ (N : M)  
                            ▼  
┌────────────────────────────────────────────────────────┐  
│                      wiki\_edges                        │  
│  (FOUNDED, WORKS\_AT, DECIDED\_BY 등의 의미론적 연결망)      │  
└────────────────────────────────────────────────────────┘

본 스키마 구조는 원문이 갱신되어도 wiki\_citations의 영구 매핑 좌표 덕분에 위키 노드가 원본 사실에서 탈탈 털려 어긋나지 않도록 강력히 결속한다1.

### **전체 인덱싱 배제 및 근거 중심 깊은 분석의 당위성**

데스크톱 PC가 감당할 연산 프로파일을 현실성 있게 확보하기 위해서는 "전체 메일/드라이브의 사전 위키 자동화"라는 이상적 환상에서 완벽히 탈피해야 한다2.  
Gmail과 Google Drive의 전체 영구 본문을 정기적으로 자동 요약하려 시도할 경우, 유용성 관점과 비용 관점에서 여러 한계와 기회가 교차한다.

* **전면 사전 요약 방식의 이점**: 사용자가 사전에 무언가를 명시 지정할 필요 없이 검색 즉시 거대한 완전체 위키가 인쇄되어 나온다1. 사적 데이터 간에 존재하는 숨겨진 인과관계를 사용자의 선행 인지 유무와 무관하게 자가 지능으로 탐색해 내는 진정한 개인화 세컨드 브레인을 체험할 수 있다7.  
* **전면 사전 요약 방식의 현실적 장애 요인**: 대부분의 지메일 본문은 광고 메일, 단순 가입 통지, 비밀번호 초기화 메일, 플랫폼 정기 리포트와 같은 무가치한 가비지(Garbage) 데이터로 채워져 있다14. 이들을 모조리 요약하고 임베딩 연산을 태운다면 막대한 로컬 전력이 낭비되며, 생성된 지식 노이즈가 급증하여 정작 중요한 업무용 엔티티 관계망이 교란되고 왜곡된다14.

따라서 본 시스템은 검색 영역 전체에 대해서는 "초경량 표면 인덱싱(ChromaDB \+ BM25 수동 하이브리드)"만 진행해 두고, 사용자가 검색 과정에서 특정 카드들을 수동 체크하여 "근거 세트로 선택 및 위키 반영"을 단행하는 찰나에만 LLM에 콘텍스트를 전달하여 깊은 컴파일링을 구동하는 지연 평가(Lazy Evaluation) 전략을 주축으로 선언한다1.  
이로써 사용자는 완벽히 통제 가능하며 신뢰할 수 있고 가벼운 나만의 개인 지식 베이스를 안전하게 유지할 수 있다1.

### **불완전 질의 해소를 위한 retrieval UX 및 백엔드 전략**

데스크톱 지식 브레인은 사용자가 완성형 질의어를 거의 치지 않는다는 현실적 가정을 수용해야 한다4. 사용자가 단지 "김 부장 오피스 365 계약서"라고 파편적으로 던졌을 때의 내부 처리 시퀀스는 다음과 같다.  
백엔드 영역에서는 질의어를 즉시 벡터 디비에 전송하지 않고 동적 질의 확장(Query Expansion) 및 퍼지 매칭 인터셉터를 발동시킨다17.  
질의 분석기(Query Parser)는 김 부장이라는 명사에서 직함을 박리하고 인물 위키 디렉터리(wiki/topics/) 내의 김철수 또는 김영희 관련 엔티티 별칭 사전을 역조회하여 정규 인물 마크다운 경로를 획득한다6. 동시에 오피스 365와 같은 상표명 인근에 배치된 라이선스 계약 타임라인 및 메타 필터 속성을 SQL 조건 절로 합성해 낸다20.  
프론트엔드 단의 UI 레이아웃에서는 검색 카드 결과 노출 과정에서 Progressive Disclosure of Confidence를 의무 탑재한다30. 이는 일치율이 의심스러운 애매한 문서들을 과감히 배제하지 않고 하단에 접힌 영역으로 격리 배치하되, 해당 문서가 검색 결과 하위에 잡히게 된 계통적 원인을 자연스러운 문장으로 표기해 주는 것이다30.  
"김철수 부장의 이메일 수신 기록에서 오피스라는 명사가 4차례 매칭되었으나, 작성일이 1년 전이므로 하단 배치합니다"와 같이 판단 사유를 적극 개방하면 사용자는 지능형 검색의 매칭 논리를 온전히 신뢰하게 된다15.

## **Wiki 생성 및 형상 관리 파이프라인**

본 지식 파이프라인은 정교하게 통제된 상태 전이 메커니즘 하에서 점진적으로 가공 및 저장 단계를 이동한다15.

### **원천 자료에서 위키 재생산 및 재색인에 이르는 7단계 데이터 스토어 명세**

\[원문 검색\] ──► \[사용자 선택\] ──► \[Evidence Set 저장\] ──► \[LLM Wiki 생성\] ──► \[로컬 저장소 커밋\]

각 단계를 통과할 때마다 시스템은 다음 형태의 정밀한 상태 객체 및 디스크 물리 아티팩트를 합성하고 관리한다1.

* **1단계: 원문 검색 및 하이브리드 필터링**  
  * *저장 데이터*: 검색 질의와 렉시컬/벡터 매칭 연관도 실수 점수, 문서 메타데이터 정보20.  
  * *동작 메커니즘*: ChromaDB 코사인 디스턴스 연산과 SQLite FTS5 검색 결과를 조인하여 실시간 큐 메모리에 대기시킨다1.  
* **2단계: 사용자의 마우스 클릭 기반 근거 수용**  
  * *저장 데이터*: raw\_source\_id 값들의 고유 어레이, 그리고 해당 문서 본문 중 사용자가 마우스로 블록 지정하여 하이라이트한 팩트 텍스트 리터럴 구문들1.  
  * *동작 메커니즘*: 사용자가 브라우저에서 '수용'을 체크하는 즉시 선별 배열이 확정된다1.  
* **3단계: 근거 데이터셋(Evidence Set) 디스크 직렬화**  
  * *저장 데이터*: evidence\_sets 전용 로컬 JSON 메타데이터 아티팩트15.  
  * *동작 메커니즘*: 선택된 본문 블록, 작성자 이름, Gmail 원본 Message ID, 문서 저장 경로 및 체크섬 해시값을 묶어 로컬 스페이스 디렉터리 내의 세션 파일로 디스크 저장한다12.  
* **4단계: LLM Wiki 컴파일 및 구조적 마크다운 가공**  
  * *저장 데이터*: YAML Frontmatter가 조립 완결된 Living 마크다운 아티팩트5.  
  * *동작 메커니즘*: 로컬 LLM이 JSON 가이드라인을 참조하여 규칙에 수렴하는 마크다운 본문을 동적 빌드한다6.  
* **5단계: 지식 적격성 린팅(Linting) 및 충돌 평가**  
  * *저장 데이터*: 컴파일 타임 린트 리포트 로그 JSON 데이터1.  
  * *동작 메커니즘*: 깨진 내부 참조 고리가 존재하는지, 모순된 수치 표기가 발견되는지 파서를 구동해 교차 분석을 전개한다1.  
* **6단계: 로컬 저장소 커밋 및 Git 백킹 형상 보존**  
  * *저장 데이터*: Obsidian 호환 wiki/topics/ 및 wiki/sources/ 하위 물리 마크다운 쓰기 완료1.  
  * *동작 메커니즘*: 디스크에 파일을 영구 출력한 즉시 Tauri 쉘을 통해 git add 및 자동 변경 승인 이력 커밋을 수행한다2.  
* **7단계: 통합 위키 실시간 재인덱싱**  
  * *저장 데이터*: 새로 갱신된 위키 마크다운 파일 내용에 대한 ChromaDB 임베딩 값 및 SQLite 단어 사전 업데이트1.  
  * *동작 메커니즘*: 다음 검색 동작 과정부터 해당 위키 페이지 요약 정보 자체가 고순도 검색 타겟으로 정상 참여하도록 색인을 마감한다1.

### **인용 유지보수 및 파일 앵커 좌표 보존 설계**

로컬-퍼스트 환경에서 위키 페이지가 원문으로 향하는 참조성을 완전무결하게 유지하려면, 단순 텍스트 인용구 표기에 의존하지 말고 i-RAG 기술 설계 사상을 내재화하여 다차원 메타데이터 인덱스를 유지해야 한다1.  
위키 노드가 생성될 때, 본문 내부의 \[cite: sources\[0\]\] 지시자는 파일 후반부 혹은 SQLite wiki\_citations 맵 테이블을 통해 원본 소스의 실재 위치와 촘촘히 락(Lock)을 맺어야 한다1.

### **4\. 원천 원문 근거 인용 (Evidence Snippets)**

* \[sources\[0\]\]: Gmail Message-ID 18ec063f92d4b2e8, 보낸이 project-manager@corp.com \[메일 본문 보기\]16  
* \[sources\[1\]\]: Google Drive File ID 1rAxB5u\_yTq..., PDF 4페이지 12라인 \[원본 파일 열기\]16

이와 같이 메일 메시지 고유 키 및 PDF 내부 페이지/라인 메타데이터를 저장하면, 향후 구글 크롬 Gmail 클라이언트나 로컬 아크로뱃 앱의 딥 링크 주소로 사용자를 순간 이동시킬 수 있어 최우수 신뢰도를 제공할 수 있다2.

### **SAGER 사상 기반의 점진적 병합 및 충돌 제어 프로세스**

새로운 근거 세트가 기존 위키 주제 문서와 조율될 때 전체 페이지를 통째로 덮어쓰는 것은 기존 사용자 커스텀 마크업 노트를 파괴하는 안티패턴이다34. 이를 막기 위해 본 파이프라인은 점진적 대비(Contrastive Synthesis) 규칙인 SAGER 기술 설계 사상을 로컬 환경에 적용한다34.

                \[신규 유입 근거 정보\]  
                         │  
                         ▼  
        \[기존 위키 파일과의 교차 비교 분석\]  
                         │  
        ┌────────────────┴────────────────┐  
        ▼ (모순 없음)                      ▼ (모순 감지)  
\[구조적 JSON Diff 합성\]             \[Conflict State 분기 및 락\]  
        │                                 │  
        ▼ (특정 섹션 Append)                ▼ (사용자 수동 조율 유도)  
\[마크다운 본문 안전 병합 완료\]       \[사용자 최종 승인 후 위키 저장\]

로컬 LLM은 기존 마크다운 본문과 신규 근거 세트를 비교하여 완전 대체 대신 보충 기입할 조항, 수정이 필요한 특정 섹션 헤딩을 정적 식별하고, 가벼운 JSON 스키마 조각만 방출하여 백엔드 파이썬 코드 단에서 안전하게 해당 세그먼트만 삽입(Append) 또는 부분 갱신(Update Section)하게 구동한다34.

### **지식 승인 단계의 이중 폴더 격리 구성**

인공지능이 컴파일러 형태로 자동 생성한 초안은 사용자가 엄격하게 눈으로 한 번 통과시킨 공인 위키 정보와 완벽히 물리 격리되어야 지식이 왜곡되는 일이 없다1. 이를 위해 마크다운 전용 디렉터리 경로 자체를 분리 운용한다12.

* **wiki/candidates/ (후보지식 폴더)**: RAG 파이프라인에서 자동 후보 합성되었으나 인간의 수동 승인을 거치지 않은 비공인 파일 저장 공간12.  
* **wiki/topics/ (공인위키 폴더)**: 사용자가 가시적인 UX 단말 화면에서 승인 단추를 명시 눌러 승인 완료된 신뢰 보증 지식 저장 공간6.

검색기 가동 시 wiki/topics/ 내의 문서는 최고 가중치를 소유하며 절대적 팩트로 활용되고, wiki/candidates/ 내부의 문서는 일시적 후보로 낮은 검색 가중치를 획득하게 통제한다12.

## **구현 구체화 및 실전 프레임워크 설계**

앞서 도출한 핵심 메커니즘을 구동하고 유지하기 위해 명확히 정의된 세부 패턴 명세를 규정한다.

### **D. 검색 품질 개선 로드맵**

로컬 데스크톱 성능 극대화를 향한 검색 품질 개선 로드맵은 다음과 같이 점진적이고 구체적으로 추진되어야 한다13.

\[1주차: 하이브리드 인덱싱 체계 가동\]  
  └── ChromaDB 통합 셋업 및 SQLite BM25 한글 형태소 형태 파서 연동  
  └── Tauri 파일 시스템 읽기 바인딩 완료 및 카드 뷰 포털 레이아웃 마운트 \[cite: 1, 14\]

\[2주차: 통합 융합 및 로컬 재정렬 작동\]  
  └── RRF 순위 합산 수식 도입 및 BGE-Reranker-Lite 로컬 로딩 파이프라인 구현 \[cite: 18, 23\]  
  └── 매칭 이유 시각 하이라이트 구현 및 검색 리스트 피드백 버튼 연동

\[1달차: 쿼리 확장 및 위키 동기화\]  
  └── 동적 Query Rewrite 룰 탑재 및 위키 링크/소스 변경 감지 백그라운드 리인덱서 완료 \[cite: 1, 17, 33\]  
  └── Obsidian 지식 링크 시각화 그래프 개발 및 Candidate 승인/조율 충돌 해결 가이드 UI 탑재

### **E. LLM Wiki 생성 프롬프트 및 파이프라인 패턴**

로컬 LLM(Qwen-2.5-7B 혹은 Llama-3-8B)이 스키마 약속을 탈탈 털어 완전 무결하게 이행하도록 엄격히 유도하는 로컬 최적화용 원샷 시스템 프롬프트 명세서이다4.

# **SYSTEM PROMPT: LOCAL-FIRST KNOWLEDGE COMPILER (WIKI COMPONENT)**

## **1\. 역할 정의**

당신은 오직 사용자가 검증하고 제공한 \[근거 데이터셋(Evidence Set)\]에 기재된 명백한 사실 정보만을 바탕으로 위키 지식 마크다운 아티팩트(wiki/)를 완벽히 구축하고 관리하는 정밀한 지식 정보 컴파일 아키텍트입니다1.

## **2\. 준수 원칙 및 안전 가드레일 (Safety Guards)**

1. **절대 금지: 정보 임의 확장(No Extrapolations)** 제시된 근거 데이터셋 텍스트 내에서 직접 인출해 낼 수 없는 외부의 학습 파라미터 지식, 배경 사실 정보, 또는 합리적으로 보이지만 적혀 있지 않은 가정사항을 한 단어조차 추가하지 마십시오19. 근거가 불충분할 경우 절대 상상해 내지 말고 즉시 \[INSUFFICIENT\_EVIDENCE\] 상태 플래그를 본문 영역에 단언 기록하십시오19.  
2. **출처 추적 연쇄 유지(Preserve Citation Coordinates)** 기술하는 모든 단락, 핵심 사실 문장, 그리고 단언 조항 바로 뒷부분에 대괄호를 배치하고 해당 근거가 기원한 원천 소스 인덱스 번호를 반드시 inline 인용 표기하십시오 (예: ... 예산은 2.5억으로 조율 완결됨 \[cite: sources\[0\]\])6.  
3. **구조화 응답 약속 (Deterministic Output Formatting)** 인간 다운 장황한 서두 설명 문구, 앞뒤 인사말, 부가 설명 혹은 주의 조항 문단을 절대로 출력하지 마십시오21. 반드시 아래에서 규정한 완벽한 형식의 마크다운 소스 코드만을 반환하십시오.

## **3\. 타겟 출력 마크다운 구조 템플릿markdown**

id: {반드시 영문 소문자와 dash(-) 기호 조합으로만 생성된 고유 식별 명사}6 title: "{페이지 성격을 단번에 드러내는 한글 제목}"28 type: "PROJECT" | "PERSON" | "ORGANIZATION" | "DECISION"6 sources:

* "{원문 데이터 소스 식별 고유키 \#1}"6

## **1\. 종합 상황 정제 요약 (Executive Digest)**

* {근거에 완벽히 정위한 3문장 이내의 고도로 간결한 지식 정보 요약}6

## **2\. 세부 세그먼트 사실 관계성**

{추가적으로 서술이 요구되는 마크다운 본문 영역. 필연적으로 \[\[wiki-links\]\]를 풍부하게 배치하여 다른 위키 명사 노드와의 의미론적 망을 연결하십시오.}5

### **F. 로컬 LLM 제약에서의 최적화 전략**

가장 빈번하게 로컬 운영 체제에서 불거지는 자원 충돌 문제들을 사전에 차단하기 위한 3가지 하드웨어 조율 책략이다18.  
첫째, 로컬 임베딩 생성 연산에 사용되는 CPU 분리 구성 전략이다18. 지메일 수천 건이 유입되어 한꺼번에 ChromaDB 인덱서가 작동할 때 로컬 OS 전체의 화면 주사율이 하락하며 그래픽 드라이버 고착 현상이 유발되는 것을 방지하기 위해, 임베딩을 구성하는 코드는 오직 CPU 멀티코어를 최대로 점유하도록 Ollama Modelfile 지시자 상에서 PARAMETER num\_gpu 0을 바인딩하여 런타임 메모리를 완벽히 격리 보존해야 한다18.  
둘째, KV 캐시 스필오버(Spillover) 및 메모리 가두기 방책이다18. 로컬 LLM 구동용 백엔드 파라미터는 num\_ctx \= 8192 토큰 임계치를 고정 명시함으로써 가용한 통합 메모리의 한계를 원초적으로 가두어 두고 CPU 가상 스왑 디스크로 메모리가 탈출하여 속도가 반토막 나는 대참사를 미연에 차단해야 한다18.  
셋째, 로컬 이중 검증 모델 할당 구조이다1. 위키 노드가 저장될 마크다운 파일에 형상 수정 연산이 인가되는 최종 쓰기 타임라인 단계에서는 추론 연산용 모델로 가벼운 ![][image4] 소형 모델을 투입하고, 생성 완료된 문서에 대해 맞춤법과 링크 손상 여부를 확인하는 백엔드 정적 린터(Linter) 단계에서는 보다 엄격한 정규 정적 파서 엔진을 적용하여 지식 오염의 파급을 철저히 억제한다1.

### **G. 평가 지표와 테스트 시나리오**

개발 변경 이력이 저장소에 푸시될 때마다 로컬-퍼스트 환경에서 빌드 시점에 자동으로 가동하여 시스템 가중치를 점검하는 지표 수식 정의 및 테스트 베드 설계이다16.  
![][image5]  
여기서 ![][image6]는 특정 질의에 대해 실제 유의미한 근거가 존재하는 골든 셋(Golden set) 정답 문서들의 전체 집합이며, ![][image7]는 검색 엔진이 최종 도출해 낸 상위 ![][image3]개의 문서 집합이다16.  
![][image8]  
여기서 $|Q|$는 전체 평가 질의의 개수이며, ![][image9]는 ![][image10]번째 질의에 대한 첫 번째 실제 관련 골든 셋 문서의 검색 순위이다16.  
![][image11]  
여기서 $\\text{DCG}*k \= \\sum*{i=1}^k \\frac{r\_i}{\\log\_2(i+1)}$이고, ![][image12]는 상위 ![][image3]개 결과를 관련성 순서대로 완벽하게 나열했을 때의 이상적인 DCG 값이다16.  
![][image13]  
![][image14]  
![][image15]  
![][image16]  
이 검증 체계를 테스트하기 위해, 소규모 개인 로컬 데이터 환경에서도 현실적으로 기능하는 무인 연동 테스트 시나리오가 백그라운드 환경에 미리 확보되어 상시 기동해야 한다21.

* **시나리오명**: Vague-Context-01  
* **질의 명세**: "그 당시에 계약금 조율하면서 김 과장이 메일로 언급했던 보증서 제출 요구 조건 관련 파일 좀 찾아줘."  
* **골든 셋(Golden set) 정답 물리 문서 지정**:  
  * **Gmail 아티팩트**: id: msg\_2026\_04\_01\_092 (보낸이: pm\_kim@corp.com, 제목: \[계약협의\] 보증 이행 요청 서류 발송 건, 본문 핵심 구문: "당사 재무 관리 수칙 제14조에 입각하여 본 보증 보험 보증서의 이행 유효기간은 1년 보장을 원칙으로 제안합니다.")16  
* **검증용 테스트 어서션(Assertion) 리스트**:  
  1. assert\_recall\_check: RRF 및 교차 정렬 가동 완료 시점 상위 Top 5 검색 카드 리스트 내에 msg\_2026\_04\_01\_092가 명백히 살아남아 존재하는가? (![][image17])16  
  2. assert\_citation\_mapping\_check: 생성된 위키 페이지 내부 sources 헤더 목록에 해당 Gmail 원본 식별자가 영구 링크 형태로 등재되었는가?6  
  3. assert\_deterministic\_json\_parse: 백엔드 파이서 컴파일 통과 시 출력 형식 JSON이 무조건 정상적으로 파싱 성립되는가?21

### **H. 피해야 할 안티패턴**

프로덕션 아키텍처 구성 시 치명적인 성능 하락이나 신뢰도 파탄을 초래하는 안티패턴 3가지를 분석하고 회피 전략을 정립한다1.  
첫째, "무차별적 백그라운드 자동 요약(Ingest-All)의 유혹"이다2. 지메일 수만 건이나 구글 드라이브 내 구형 캐시 문서까지 모조리 백그라운드 에이전트 요약 프로세스로 돌리려는 기획은 로컬 연산 자원의 고갈과 수많은 무의미한 지식 노이즈의 유상태 위키 편입으로 이어져 결국 지식 베이스 자체가 붕괴하게 만든다1.  
해법은 오직 표면 검색만을 자동으로 보증하고, 실제 고부가 가치의 위키 생성과 업데이트는 사용자가 RAG 검색 카드에서 직접 선택한 근거 세트만을 대상으로 제한하여 점진 처리(Lazy Evaluation)하는 것이다1.  
둘째, "맥락이 유실된 단편 분쇄 청킹(Context-Slicing)"이다13. 이메일 대화 흐름(Thread)을 하나의 연결된 생명체로 보지 않고 각각의 메시지 청크 단위로 무자비하게 쪼개어 임베딩하는 방식은 발신 주체와 시점, 피드백 맥락이 소실된 파편만 남아 검색 정확도를 완전히 추락시킨다20.  
해법은 이메일 스레드를 고유한 구조적 엔티티 단위로 유지하고, 헤더 메타데이터와 대화 전개의 시간적 선후 관계를 청크 내부 앵커로 유지해 인덱싱하는 것이다20.  
셋째, "인간의 검토가 없는 자동 병합 위임(Ungoverned Auto-Merge)"이다1. 로컬 AI가 생성한 임시 요약 결과를 어떠한 사전 격리 없이 기존 마크다운 위키 페이지에 곧장 덮어씌우게 방치하는 설계는 환각과 엉뚱한 결정을 위키 지식에 축적하는 지름길이다1.  
해법은 반드시 후보 격리 폴더(wiki/candidates/)를 거치도록 설계하고 사용자가 버튼을 눌러 공인 폴더(wiki/topics/)로 편입할 때만 영구 지식층에 병합하도록 가드레일을 공고히 세우는 것이다6.

### **I. 현재 프로젝트에 바로 적용할 수 있는 우선순위 Top 10**

본 React-FastAPI-Tauri v2 프로젝트의 기성 구현부를 고도화하기 위해 즉각 실행되어야 하는 개발 업무 가이드라인이다1.

1. **ChromaDB \+ SQLite BM25 역순위 융합(RRF) 통합 검색기 구축**: 백엔드 FastAPI 측에 RRF 상수 ![][image18]을 사용하여 두 엔진의 점수를 융합하는 API 인터셉터 설계 및 구축1.  
2. **로컬 BGE-Reranker-Lite 탑재**: 상위 15개 융합 후보군만 로컬에서 즉시 재정렬하여 최종 Top 5로 좁혀주는 교차 인코더 모듈 연동18.  
3. **물리적 위키 폴더 격리**: Tauri 쉘이 바라보는 Obsidian Vault 폴더 내부에 candidates/ 디렉터리와 topics/ 디렉터리를 엄격히 생성 및 세분화하고 파일 쓰기 경로 분기6.  
4. **Ollama KV 캐시 메모리 락 고정**: FastAPI 가동 인자 상에서 num\_ctx \= 8192 토큰 한계를 확실하게 부여하여 CPU 시스템 가상 스왑으로의 메모리 누수 방어18.  
5. **정적 YAML Frontmatter 메타 유효성 검증 linter 설치**: 생성 완료된 위키 파일의 YAML 블록을 파싱하고 유효성 오류(Validation error) 시 후보 폴더로 회수하는 Pydantic 메타 linter 작동6.  
6. **로컬 Git 커밋 자동 형상 백업 연동**: Tauri 백그라운드 스레드에서 파일 쓰기 완료 이벤트 인지 시 git add 및 커밋 파이프라인 수행 모듈 기동2.  
7. **외부 LLM 차단 명시적 경고 팝업 구성**: React 프론트엔드 단에서 외부 상용 API(OpenAI 등)로 이메일 텍스트 내용을 전송하는 동작이 감지될 때 경고 창과 확인 버튼을 의무 표출하는 UX 보강30.  
8. **설명 가능한 검색 하이라이터 UI 완성**: 검색 카드 내에 시맨틱 매칭 어휘들과 렉시컬 일치 항목이 왜 잡혔는지를 한 줄의 간단 명료한 자연어 팩트로 표기해 주는 뷰어 개발15.  
9. **이메일 스레드 정규 인덱싱 구조 개정**: 이메일 청크 생성 시 동일 스레드 내의 메시지 ID들을 메타데이터 어레이 구조로 일관성 있게 상호 바인딩 처리20.  
10. **골든 셋 30선 테스트 스위트 배치**: 로컬 빌드 테스트 타임에 무인 기동하면서 매회 검색 recall 및 MRR 변화 추이를 파일로 남기는 평가 스크립트 작성21.

## **결론 및 권고사항**

본 보고서에서 제시한 로컬 RAG와 LLM Wiki 융합 기반의 고성능 개인 지식 시스템은 하드웨어 자원이 제한된 로컬 데스크톱 환경에서도 안정적이고 신뢰도 높은 개인 장기 기억 구조를 형성할 수 있는 최적의 타당한 대안이다1.  
시스템의 설계는 단순히 기술적 우수함이나 고성능에 매몰되지 않고, 사용자가 직접 수용하고 정제한 "근거 데이터셋"만을 중심으로 지식이 통제되며 스스로 진화하도록 보증하는 "인간 주도의 AI 지식 컴파일러" 방향으로 수렴된다1.  
특히, 무작정 전면을 인덱싱하려는 과도한 시도를 전면 통제하고, 지연 평가 방식 하에서 점진적인 지식 린팅과 SAGER 사상의 부분 병합 디퓨저를 적용하는 방향은 로컬 CPU와 GPU 부하를 원천 통제하는 데 극단적으로 유효한 길이다1.  
위의 순차적 10가지 실행 우선순위를 바탕으로 brownfield React-FastAPI 아키텍처를 점진 개선해 나간다면, 사용자는 사적인 데이터가 외부로 1바이트도 유실되지 않으면서도 나날이 의미망이 팽창하고 깊어지는 가장 견고한 전용 세컨드 브레인을 로컬 데스크톱 상에서 무결하게 완성하게 될 것으로 판단된다1.

#### **참고 자료**

1. What Comes After Obsidian\! LLM Wiki, GBrain, Hermes Agent, Graphify—The New Paradigm of 'Delegating Knowledge Management to AI' \- note, [https://note.com/kagawatomo/n/n269e5fc98042?hl=en](https://note.com/kagawatomo/n/n269e5fc98042?hl=en)  
2. LLM Wiki \- Gist \- GitHub, [https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)  
3. LLM Wiki by Andrej Karpathyi: Build a Compounding Knowledge Base (Tutorial), [https://datasciencedojo.com/blog/llm-wiki-tutorial/](https://datasciencedojo.com/blog/llm-wiki-tutorial/)  
4. LLM Wiki. Wiki using Claude. | by Naresh Kancharla | Apr, 2026 \- Medium, [https://medium.com/@naresh.kancharla/llm-wiki-7bde4db3e384](https://medium.com/@naresh.kancharla/llm-wiki-7bde4db3e384)  
5. What Is Andrej Karpathy's LLM Wiki? How to Build a Personal Knowledge Base With Claude Code \- MindStudio, [https://www.mindstudio.ai/blog/andrej-karpathy-llm-wiki-knowledge-base-claude-code](https://www.mindstudio.ai/blog/andrej-karpathy-llm-wiki-knowledge-base-claude-code)  
6. LLM wiki CLAUDE.md template (Karpathy gist schema) \- Hjarni, [https://hjarni.com/blog/llm-wiki-claude-md-template](https://hjarni.com/blog/llm-wiki-claude-md-template)  
7. Hybrid Search | PhoenixAI Glossary, [https://www.phoenixdata.ai/glossary/hybrid-search](https://www.phoenixdata.ai/glossary/hybrid-search)  
8. Knowledge Management in 2026: PKM Tools, Self-Hosted Wikis & Digital Systems, [https://www.glukhov.org/knowledge-management/](https://www.glukhov.org/knowledge-management/)  
9. Tutorial: Obsidian Knowledge Base with Claude Code \- Marketing Agent Blog, [https://marketingagent.blog/2026/03/28/tutorial-obsidian-knowledge-base-with-claude-code/](https://marketingagent.blog/2026/03/28/tutorial-obsidian-knowledge-base-with-claude-code/)  
10. What is GraphRAG? \- IBM, [https://www.ibm.com/think/topics/graphrag](https://www.ibm.com/think/topics/graphrag)  
11. GraphRAG: The Evolution of RAG in AI Knowledge Management Systems \- Bloomfire, [https://bloomfire.com/blog/from-rag-to-graphrag/](https://bloomfire.com/blog/from-rag-to-graphrag/)  
12. GitHub \- swarmclawai/swarmvault: The local-first LLM Wiki: open-source knowledge graph builder, RAG knowledge base, and agent memory store. Built on Andrej Karpathy's pattern. An Obsidian alternative for personal knowledge management, AI second brain, and durable Claude Code / Codex / OpenClaw memory., [https://github.com/swarmclawai/swarmvault](https://github.com/swarmclawai/swarmvault)  
13. Advanced RAG techniques for high-performance LLM applications \- Neo4j, [https://neo4j.com/blog/genai/advanced-rag-techniques/](https://neo4j.com/blog/genai/advanced-rag-techniques/)  
14. My notes taking app story with markdown, git, VS Code and LLM \- AI Advances, [https://ai.gopubby.com/my-notes-taking-app-story-with-markdown-git-vs-code-and-llm-84ccb3b94354](https://ai.gopubby.com/my-notes-taking-app-story-with-markdown-git-vs-code-and-llm-84ccb3b94354)  
15. RAG Pipeline Diagram: Retrieval-Augmented Generation Pipelines \- TechTide Solutions, [https://techtidesolutions.com/blog/rag-pipeline-diagram/](https://techtidesolutions.com/blog/rag-pipeline-diagram/)  
16. Index-RAG: Storing Text Locations in Vector Databases for Question-Answering Tasks, [https://www.preprints.org/manuscript/202603.2025](https://www.preprints.org/manuscript/202603.2025)  
17. TechRAG: Evidence-Gated Multimodal Agentic RAG for Technical Literature Reasoning, [https://arxiv.org/html/2606.01613v2](https://arxiv.org/html/2606.01613v2)  
18. Built a fully-local paper-RAG across 2× 1080 Ti \+ a 3090\. Three Ollama gotchas that each cost me a day. \- Reddit, [https://www.reddit.com/r/ollama/comments/1ty1qy3/built\_a\_fullylocal\_paperrag\_across\_2\_1080\_ti\_a/](https://www.reddit.com/r/ollama/comments/1ty1qy3/built_a_fullylocal_paperrag_across_2_1080_ti_a/)  
19. IR-RAG: A Next-Generation Framework for Evidence-Grounded Interpretive Reasoning | by Dr. Volkan OBAN | Medium, [https://medium.com/@drfolkan/ir-rag-a-next-generation-framework-for-evidence-grounded-interpretive-reasoning-2f5c545707ae](https://medium.com/@drfolkan/ir-rag-a-next-generation-framework-for-evidence-grounded-interpretive-reasoning-2f5c545707ae)  
20. RAG Pipelines: Examples, Process, and How to Build (For Business & Data Newcomers), [https://www.domo.com/glossary/rag-pipelines](https://www.domo.com/glossary/rag-pipelines)  
21. When Generic Prompt Improvements Hurt: Evaluation-Driven Iteration for LLM Applications, [https://arxiv.org/html/2601.22025](https://arxiv.org/html/2601.22025)  
22. Installation | Hindsight \- Vectorize, [https://hindsight.vectorize.io/0.7/developer/installation](https://hindsight.vectorize.io/0.7/developer/installation)  
23. Build a Better Local RAG with Hybrid Search (BM25 \+ Embeddings) | by Sebastian Correa, [https://scorrea92.medium.com/build-a-better-local-rag-with-hybrid-search-bm25-embeddings-10a0702dee94](https://scorrea92.medium.com/build-a-better-local-rag-with-hybrid-search-bm25-embeddings-10a0702dee94)  
24. Sentence Transformer \- Mem0 Documentation, [https://docs.mem0.ai/components/rerankers/models/sentence\_transformer](https://docs.mem0.ai/components/rerankers/models/sentence_transformer)  
25. BM25 Retriever | Developer Documentation \- LlamaParse \- LlamaIndex, [https://developers.llamaindex.ai/python/framework/integrations/retrievers/bm25\_retriever/](https://developers.llamaindex.ai/python/framework/integrations/retrievers/bm25_retriever/)  
26. RAG Interview QA 50 Questions | PDF | Information Retrieval \- Scribd, [https://www.scribd.com/document/1009241478/RAG-Interview-QA-50-Questions](https://www.scribd.com/document/1009241478/RAG-Interview-QA-50-Questions)  
27. What Is GraphRAG? Architecture, Enterprise Use Cases, and RAG Comparison \- Atlan, [https://atlan.com/know/what-is-graphrag/](https://atlan.com/know/what-is-graphrag/)  
28. Knowledge Graph for RAG | TypeGraph, [https://typegraph.dev/examples/knowledge-graph-rag/](https://typegraph.dev/examples/knowledge-graph-rag/)  
29. Implementing a Knowledge Management System with GraphRAG: A Physical Internet Example \- MDPI, [https://www.mdpi.com/2079-9292/14/24/4948](https://www.mdpi.com/2079-9292/14/24/4948)  
30. ADR-001: AI-Integrated Incident Response System \- llm-council, [https://llm-council.dev/adr/ADR-001-Council-Summary/](https://llm-council.dev/adr/ADR-001-Council-Summary/)  
31. An Auditable LLM-RAG Architecture for Financial Document Intelligence and Decision Support \- MDPI, [https://www.mdpi.com/1999-5903/18/6/284](https://www.mdpi.com/1999-5903/18/6/284)  
32. Ask HN: Best way to version control your notes or documents? \- Hacker News, [https://news.ycombinator.com/item?id=34690171](https://news.ycombinator.com/item?id=34690171)  
33. CLAUDE.md \- garrytan/gbrain \- GitHub, [https://github.com/garrytan/gbrain/blob/master/CLAUDE.md](https://github.com/garrytan/gbrain/blob/master/CLAUDE.md)  
34. SAGER: Self-Evolving User Policy Skills for Recommendation Agent \- arXiv, [https://arxiv.org/pdf/2604.14972](https://arxiv.org/pdf/2604.14972)  
35. I built Karpathy's LLM Wiki twice — once as code, once as a .md. Here's what each one gives up. | by Leandro Bernardo \- Towards AI, [https://pub.towardsai.net/i-built-karpathys-llm-wiki-twice-once-as-code-once-as-a-md-heres-what-each-one-gives-up-08b31170999a](https://pub.towardsai.net/i-built-karpathys-llm-wiki-twice-once-as-code-once-as-a-md-heres-what-each-one-gives-up-08b31170999a)  
36. Sager: Self-Evolving User Policy Skills for Recommendation Agent \- arXiv, [https://arxiv.org/html/2604.14972v1](https://arxiv.org/html/2604.14972v1)  
37. 2501Pr0ject/RAGnarok-AI: Local-first RAG evaluation framework for LLM applications. 100% local, no API keys required. \- GitHub, [https://github.com/2501Pr0ject/RAGnarok-AI](https://github.com/2501Pr0ject/RAGnarok-AI)  
38. Choosing a note system: My Experience with Syncthing, BookStack, and Git | Gaelan Lloyd, [https://www.gaelanlloyd.com/blog/note-taking-system-comparison-git-markdown-syncthing-bookstack/](https://www.gaelanlloyd.com/blog/note-taking-system-comparison-git-markdown-syncthing-bookstack/)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAE0AAAAZCAYAAAB0FqNRAAADE0lEQVR4Xu2XS8hNURiGX6HchSK5/JFLSkpIDAxEUZRcQqS/pAz+lIRMRDJQyEQkkoFckpJMJPeBGCmlRB2SQhQxoFzet2+vf6/9nb33Of8fh8F+6u2c831r773Wu9da3zpARUVFRUVFRfcYQI32QccrpwvUiUirqP6drf8dvamx1Fyqh8vdQ3YMD5Adw15qEuqvy0WG/aLeod4c6TC1ktpOfUva6ncsxT5RS9DkQ/8CevZb6gp1inpKzYryi6k11HVYf9uRHcPzJH6RGmqXFKMbq3GeflArknYjqZdJ3LMeafuFLtcqHlMTot+7qI/U9CgmdsL6qhUWM4x6mOSuulwdS2FvQG4voybCpvhl2IPDzCkzbRRVg+XOZVMtQQZ0uNgQ6hG138WLTBMhpxVVykYfIPepNhcrM20G9RWW2+xyrUAG6dm7qb5JTLOuRi1PfgeKTOtFnUxyT1yuIcORv8TKTLsLix9H2ulWo+dL2pvmU3eoY7DiEFNkWjtse3lPzcmmytFSPAJz3RObFlcdbbw3qNlovgionSqVtoR5LufRoMf4YA4HkRonbaF6ZloYwbTTSMegwvEZth0NSps2h5aZNs88YtP0PZberqrvWuR31HOe+km9ob5Tq1FsuO6/zwdz0D58C3Zf9VH33YD6+wbTtHzjMWhWaqapejY6gnUS1vRrn0goW55t1DNY7oDLeTSIs0jfqEyW4Tra5C3tRdRWH8zhA2yJ9aN2IJ1x26I2omh5ql/hOh21mmId7AINKI8y04SqcOhoGTov5aHD8VHqC2yL0PKqwQbiZ4tnDzXexfQCLsFm3oIoXmSaUOw2LD8im8onVI4zPpHQyLRgelE+kFdkAjJHe5yqdw3NL3f1eaAPwl5kV0wLxxTl9b2U2OHumDYYaQXVSbzVyIipPgh7kdpuxkWxMtO0t4Y9sSGaii9Qbto02N6jNn2iuL5fS+Iq1zOjXKtoo24i+/dHG71eYLy8VYkPwfqqwhHi+tyE9KypotAUk2F/vLtccv8TtIynwP7daIZp9ldUVFRUVPxZfgPUuc5FN524jQAAAABJRU5ErkJggg==>

[image2]: <data:image/png;base64,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>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAAcCAYAAAC3f0UFAAAA8klEQVR4Xu3RL24CURDH8RGQQAq0pKSEpBcgiCpMdQ0GU0MQOMIROAEGSxruQLCAQawkQXEARAkWW9GEP9/Z9zZdHg9Tvb/kk7Azs8vOW5Ek/rxhh1/0nN5NSljjB3Wn540Ob1F2G74cMEXKbfhyRt8t+pLHHq/2Wt97gwVy0VCUKmbI4AMj1PCNSmwuTBMDvGOILBpY4TE2F0YHJ/jCg62lxfNUbS7FLKjH1xbzZG90KV2uiC6OGMudI9SFTva3bh7I32IdWwujd+uH0A+iiV4pQAEtWw/zLOY8tRnlU8zNczFLXuVJzPnGo3/94tSS/C8X47QkiwQdlx4AAAAASUVORK5CYII=>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAZCAYAAADE6YVjAAABZElEQVR4Xu2UvytGURjHv8LkZylRymQwCBkMsgmLRUpZJWaLTdlNFlLyDyj/gEFZlEUySBkYbFKKReH79Zxz732f994ryXY/9em973mec597n3PuASoq/ptO2uUHHQ/OS7qfcYs2JNk5DNNP+oj6m13RIbpAN+kHfacbYUwu02t6SFtQwBSsSJ4ntCPkjdHXoK6zqBPK36VNLvbNKtKnmqZ9dILe0NFMXlkRoSJPdNAHxJL7r97u0WY3XlZEc1TkHOmblzJOu/0giouowCJsDUcy44Wot3qaPGIRLf4xbFcdwNr6TNvT1HLW6J0fDMQib3SG9gYHYAuu3dWTZBegXuotjnwgUNQuEdfklva7WA07sMR1HwiUFRGnsPn6ba2JBNroGSxpzsUiPxW5gM1XJ3K/FfX2Hn8rog0h530goqPlBcVF1PNZ2JGihdcpEdGOXIHN3Ub995Wgm0zCJje6WEXF7/kCumJcb6a5ndsAAAAASUVORK5CYII=>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAABBCAYAAABsOPjkAAAE9klEQVR4Xu3dS6hvUxwH8CUUcT0ijzIxIemivClRJImEUpSZkIyIyMDERElRRBRKiEiRiXTKQKFEHhODy8BAIUIhj/W9e+971lnnv889HZxL5/OpX2fvtfd////3jr6t1y4FAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgPV7rG/oHN43bKKTax3QNwIAbDVP9w2NI2r92Tdu0FO1fq31e60va31V6+da+zb39E6tdWDfCACw1awV2L4oawe2W2vtqPV4rR9qnbfi6mqf1LqyOc/xN815T2ADACjzge2iWoeV+cD2Qq29uraDa13etbXyrG3N+XO1PmvOewIbAECZD2xPjn8TshaFprnPLfUNo8yFa8PfSbW+LytD397NcQhsAABlcfB6tDlOyDq6OZ8s+lws9Q2jG2u9U4ZnZSg0Ya31UFndYyewAQCU1cErAenrMiwMSCWwJTj1+s9NlvqGUT9/7aey8rlZhNAT2AAAyurg9W53noUHbdCa9J+bLPUNo37+Wttzl561l2rdUOuPXXcIbAAAO03BK8Ho4Vq3N9ey6ODjWg/W2q9pj/UGtmzbcXpZGdDyrOk835n91vK8+8brE4ENALa4abjvx/E4e4S9seKOvy9Di9NE+7fH4zaAJMg8U4bJ9gkx79c6aLy2vQy/aS4Y/VM2+vzT+obRFX3DjKwova7W/rWeqLVPrU9r3dLcI7ABADuH+y5rztPDs2gu1d/RrozMvK0pgJxY64wyDAfeX+vasf2OsryZbH7bRgPVev3bz1+Paag0/+524YHABgCsCmyZqzW379hGzQW218oQTto5Wx+V4VVMr4znWyWwzRHYAIBVge27Wpc257fVuqvW9WV5uDRDeQlex5RhODWvbzprvJ6238rK1y3NBbaEw3z3s8uXd87/SkjJhrIxBbaEuDwnr3XK9wEAbBkJbAljmfz+aq3nm2uZcJ93XU7y6qXMM/ulLL8Q/d4yhLOjyjAfKxLEMidrMhfYEsZyb9vDtVSGwDa1TYHtwlpnj2299NLl98/VnEf+ZwUAbFF9D1vCVVYsRtrT43Z1Uwlnc0Om6WH7oNYDZWUImwtsL5dhwn0C4CTf1/ew5TN5RgIkAMCW0we2hKM7x+Njy8oetvRkpfqVnrGj1gXj8dQrdu54PhfY8s7NDK9mVei3Zdj/7JQy3H/CeE+eld9zRBmGQxc5rixvcruo+u04AAD+NxKcsu3GzWV5ZWJeRP7eeH5JrTdrXTxee338e9V4T5xThtD1Ya1rxrYcZ9HAi2WY05YAdmQZQlfmtx0/3hf31DqzOc/33l2GVzilNy+/LXug5be+VYZh20N23b3npBcy8+rW0v/O/H8CAPwjzi/DYoNJeqgSuFrTvLFWhiynYctD2wvrkOfneVNw/K/b3erNm8rqDXTbnkwAAP5lawW2hM5vyjDc3BLYAAA20VqBLcO2uZ75ei2BDQBgE80FtszTy5y8DO/2q2kFNgCATTQX2LJYInJNYAMA2IMWBbZsU9JuJyKwAQDsQYsCW/t2h0hg29acC2wAAJuoDWyZt/Z5re3Ll3fNYTujLG9VIrABAGyiRT1suyOwAQBsIoENAOA/TmADAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABafwFniebeEuFRbQAAAABJRU5ErkJggg==>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA8AAAAbCAYAAACjkdXHAAAA00lEQVR4XmNgGAU0AaxA7AzE0ugSxIAYIP4PxL7oEoSAGBBfYYBoLkKTIwhOQjFI80I0ObwA5FeQk6sYyNDsB8Q8QFzOANF8AMonCISBeB+UHcRAomaQbROgbFAogzQ/BGJJuAocQIUBYosClG8KxN+A+AkQy0DFsAJbIP7JALEJHYMMABmEFYD8sxOIXdHEQU4FORlvQskA4rkMkChCBoJAfJoBojkaTQ4OzgCxNrogA8RFBxggmkEBiQJANhkB8XkG7IlfggESbSDNM9HkRsEwBwBTxyrOQFcQbAAAAABJRU5ErkJggg==>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAZCAYAAADE6YVjAAABdElEQVR4Xu2UPyhHURTHv/InoiRKSomiLAyymWSRyGCz2EwsyGywy6JQMhjEYGBT7AYZxGIgJasymPh+O/f5XaffK7/3e+P71qf33jn33XPPuedeoFAhapIckkfyQs7IbmCDDJCa39EZNUjmyBF5JgvhW1yRb3JCWsP4qrRN9p2tnhzAAu2Qur/uytRCrsm8s0vrsCBPpNP5KtIMbKI2Z+8lr8G34nwVaxM2kZc2PymVSpdZSak0WRfpJ7NkmTyQKeTQXX3kjXyh1LrnsKDt0TgvBW7wxjQlpfKdNQJraWXnpbZXI4x6RznFpfKdNYH0IBp7Tzq8o5ySUn2QYedThmltq6xP8c9zs4fSiW6M7Hq/gGWpbJvIMayE4p2Mk1VyGWjWj7G0aq1eAWLilY2RT7IEW/kabLNVKtnV1t2wuXrCP5k0DbvDtPraYFPAG1imt8GWuxRgEZaVLlVlPxSeuekOpfOjq2YLVZarnPwGxw1TKJt+AAPSSmZPif4JAAAAAElFTkSuQmCC>

[image8]: <data:image/png;base64,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>

[image9]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAC8AAAAZCAYAAAChBHccAAACCklEQVR4Xu2VPyhFcRTHv0IR5X8S9QYpg/Ivg4WUlYRBKYPFwizZlMFEUgxMBotNFgMvq0FWDCgLSSnK4M/5dn6/7n2/7n3v8bx4up/69nrnnHvO+f3u+f0uEBEREfFfuRHdia5EdYmuv8+86E10jRxsng2z8ah5S5UoX1QoqnZ8pAhajHF5js9icxAb7/Kjzc+KPqDJZqAH6V4UM34uZsnYtkSXRr3GT1bh5egQ7cA7mHyWOSxu8+vQWKt2LzQ1pdAHWPxQ1CQ6Fw0Yf6voyYiUiY6hi7GUQ3M8i46gCyBs+l3Ub/4Tt/k20QN0Q8aQuNC04ALY/Dh0JIZEJcbXIDozsjCO8X5sjmnHThvfrsVtflO0Da+eH/bCWklh4RdRl+sIgLM8geDmufOdjj1Z882iNYTvdq3owjW6hBUm3PkT6N1cbGwcqUybZ75J4+fcF/hivkRYYb427gwLzPnstvlKePMdliOs+Tj0mQPoQkZ8MXwTi9AzuOuzBxJWmPa46FXU7bNPQZvimHFxJCxHquZ50B+hl0TMxIxCz90g0hgb3s+c+T4k3uFBO88CPLy0cbd4TRKbo8f8J7zzGbcAb64bRbeiU1E9tMaGidszMcPQbw2vXLs5GcFd8n+g+Gs/SNmAb5dnrQYZnIffgDfaPnTuWxzfn4dvdQX6RV92fDkBF1CB7I5mxLf4BNCse/xG7cPDAAAAAElFTkSuQmCC>

[image10]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAcAAAAcCAYAAACtQ6WLAAAAl0lEQVR4XmNgGOpAEIgZ0QVBgBWI/wOxJ7oECAgD8XMg1kSXgAEOdAG8QAWITwPxayCWR5bgAeIVQGwGxKZAXIQs6QLE/QwQ56cDcQSyJMjZIB2cQLwDiBWRJWFAB4jfM+AIgAYg/ocuCAL8QHwCiK8DsTIQByJL+jJAgg1EL2eAhBQcyDBAdO0HYhNkCRgABZskuuAwAQBeMhIecZlDswAAAABJRU5ErkJggg==>

[image11]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAAA/CAYAAABdEJRVAAAFkElEQVR4Xu3dT6hmZR0H8GdIYULNJt34J5xRjBLNxTRBoiCDi4ZQIQWjWgy00RgQHFJwdV200J0tNERFkahs1BbiH4h6s6AiiDb9gQhUpCgXQqALRev5zjnP3Oc9c+7bexuE6fL5wI/3nOc897337r6c5zy/UwoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcNo7VOvWSV24NGPZ0Vrv1Hqp1kdqfWv5cjmv1u9r/a3WwVq7an1xaQYAANt2T63fdudX1Pp3rTO7sbPGsU90YxvjWPNUrWe68/x8rt/YjQEA8D9IYFtMxvbXers7f7/M3ylrge26Wh/0F0Y3FYENAOCUzQW2SBi7qNal43GWN6cW4+ffa32vG2/OLgIbAMApWxXYErZS/dLnnFzP9wAA8CFYFdgOlGF5dKvAlmfbIsun3+7G99b6Zhk2MdxX6+O1zi9bfw8AACvMBbY9ZTlc5Xhfd948N35u1HqjG28S5Pol0de6YwAA1jQX2P5a65buPMdvdedxbhk2FTTZmHBNdx7vlc3Adkat75ThrtuLJ2YAAKxp2osstXtpxqb0H/tBrX+VYbkvHt68fFyCyz9r/bkMvckuKZvLh03aZ+SOU+Z9aXLtG7UenIx9GPL7c/esr1drfayb01xWhus/HuvI8uXjnq31bq1HytCvLcug7X+7ttb3x+Orxk8AgG1JePlad353rTe787ihDMt8/Y7J3I1adOe5E9XfefpMGYJOdkw2vyhD8Ov9rjs+pyy31dgJjo2fP6n12f4CAMC6EtimLSgeHSs+Wobglc9egthiPH66DG8BmFqUzcD2lTI0lf1yGe5E5TzHkfPI3J0W2P40fv6y1uf6CwAAzfVlWMLMUmdesXTn0tX5wNbujkV2QWaZb85i/Gw7K6fyvS2wvVCG57n6RrP3luFZsjzjFX1gu7LWBbUuH88BAHa0NHj97nicgHRXd20usCUoteXMRVm9yzFzMjc/s8qTta4uy6+Dyt+Sar+/D2w/LfM7NJ+o9fqK+tSJmQAA/0cSuFqgSjhKeOqvbRXY8sxa5ibwzckzZ5G5eTNAk80DWfLMJoaHxrEflSGQ9bsutwpsL5eTNysAAOxo2w1s2YTQ+ovlLlffm6zXnj3L3I1uvOk3HWyUIQDmZ24rw47MBMEsuf5wnJO5aZOR5dDpxocmc/K/bFX5HXNuP00LAOC47QS2bAxI0Eq/sSY7HFs4a9KjrIWxzJ1uTMjzatNdor/pjudkbv6eyEaG7FgFANjxFmWz19hXu+MsRbbjvp4v83epDpfh+mO1/liG1zD1EvRaD7bM+Uutg2U5sMX9ZQhumZOebnm2rrX6aH9DQlsqxztt1ygAACv0DYJvLsMO2mnj4DTK3crXyxAyf12GgNq/FSHWaS4MAMB/kTt3rcdcZDm431RxcTl5SbgtE+/txg6PY806zYUBAFhDAluWg5sEtvbcXPPJstwvLhsgjnTnTVuubYFuVXNhAADWtE5giwSw/bX2jMethUmvbd5Yp7kwAABr2k5gy7yEtn7pc86izH/HVF4QnxfDAwCwwnYCW9512poIp03J1O7xM3faps2FHyjDJoY0ET40jvVveQAAYAvrBLbWQ66FtBx/YfPyCY+Pn/vK/F24BLlFd/6HWp+u9fNuDACAiYSzvHS+mQtsr5Tlpr2fL8MbGHrZaHC0O09z4X73aRwrm4Etz8IlqO2qdW2bAADAstaYtzXkXUzGUv8o8y+yz7NnCW15KX1epZUGwFOHy/AdaQqcBsIHyvDGhsjrvvIdCYcXjWMAAJxGfjZ+/qrWHf0FAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgtPcfA4kvtCU+GokAAAAASUVORK5CYII=>

[image12]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAD8AAAAZCAYAAACGqvb0AAACu0lEQVR4Xu2YTahOURSG3xuK/LvlL8XAhIzIQF0lKRmQvyIMlGJMfkqpOzFQpJSJSEgUZaSQJAMTA5kwUpdEESIU8vO+1re1zrr7+z7fOerWd89Tb/fetfZ7zlnn7LX3BqipqampGR5soc5Qp4KmUpep5063w5gdVC/aM4E6Qv2i3lGvqQFqA7WNOvt3ZBH53qPok6cHrX3/zDxqI/UTdpOTjb9HU8uozdStRk43VC7pA/WN2keNQp7l1BvqMzXWxWdR12DFnXPxRPLtRtEnzxU095XiFazA1TFBDsBy40JcD3WhkTsacmI97OW8pBaGnJgI88Yikk+zLSKPZmDOV5pn6Lx4oYe5B5s5kaew+KaYcGhG+CLmoL1vEQb7KlG2eKHWeUutcbFpMM9hF8txEMUiBmC+Ey6WI/oqUaV4Faqv5R+4D+bZ6mI5FsPWlcR3mG+Xi+WIvkpUKV7xu9R12EIpdJ1m12uFPGV8npEx0I7/UbyUxgxF8dp6P8HasCOqFD+ZeoBiD66CebRyd0Kr4idRM4LiFqt2GR9ibalS/ArY6rzAxTT15PGtkENrghavxCWY7wY1xsUTPdRF2Ji44KW1p2PKFq8iT8Pysde+wrYkbU3NUAF6eYmlMJ+k33PIkytei6zqmE4dp25S2/2AZrxA58XrK2gv/kE9CjmxH+bToUTngRw6rfkvrGsm3x0XT6T1JVe8nlPtt5daQn2k9hRGZNANv8AuuJMa4XLqqWONnHo7of4734jfhx1XI/Lq5KcxD0NO91xJzQ5xIV8/zDe/mPrzstOz+uI1665ST2B+vVDNBH80HjJUrGaV/k2wFnaSU6wdM2E+rQ3a1/2H8aQpr5VeP7XgTqHm+kHdiqa3prxm52PYy1gHm/5dj1pA7Sm0w+i0eQiDt8KuRL2dClVr6P8ZmrVIzbDmN9V2vxuVYqi3AAAAAElFTkSuQmCC>

[image13]: <data:image/png;base64,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>

[image14]: <data:image/png;base64,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>

[image15]: <data:image/png;base64,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>

[image16]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAmwAAABECAYAAAA89WlXAAAStklEQVR4Xu2dd+g0RxnHn6AGW+wVS95YUaOxRE1ie7EExd6IYiEoiQULRCwJQQ0iKPZeUBMTNPZCEqJR9Ej8wwaKKEqMGEUjKiqCiolY9sPs4z333Mze7L2/tyT5fmC429m93Wk7851nypkJIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEuBpx7exxNeKQ7LGBg7JHJ9fKHhPsSX7Mec7cuEd6f3tw9pjBnqRDL+Rnb55eN3tsYNu4Xy97bGDu9XOYU57msDfDHJmTv7BtmZv7u2tkDyGEqHH44G6f/H44uNsmv28M7iXJ7+GD+1Xym+L62WMHeeDgjh3crYPj+GvWX0lz3d+tvwF54uA+kT0n+NzgThu/X2QljD1829bzo4cjBveT7Nlgbtzh8VZ+R4Pz33SuBXG5W/ZM1PKL+BO+yDGDe8bgnja65w/uw4P77eAeEq6bw4mDe3f2bHCZzSvTxL03zx3S4vLsOQF58Z/suYd80EraAuV2m7I4xdw4ZmqC5w1WygTpHc+Tvx8Px1PcxNbLXC895dzhPSVdDyQ+P7hzsqcQYv9ww8H90UplSc/534O75niOCq3WsNTEWc2vBc+iYe8VBb8Y3Muy5wQ10VDzgxtYadj5jNTiwzV/sXKvNwd/0qhV+T9pdC4mvjj6e3haaXyorYe5dW3kAYM7z1bFDmJiEY5vZeXevxncr60Ijti41+I+BQ23xz+H2TlycFfYUtj0xOVBVoTX+5N/T/i+Pri3Z8/EY6yEiTTgOXyePJ673+BePX5vcaPxc2Hrgo1OzF+tCEnC+9xwrifuzi1sKTRq8X6clTT/w+hivm8SGWcN7vzsOXKqLcvsuYP77ujv98xxeKOVcLTcSctL17ipTccxQlnjGvLLw4fjfaQjVKNm6arl70NtGd7cKd2UlpS37w3uS1bqUyenU42jxs/8nmZ4r1vvV4aySRp5R8Y7MV+2co/eupffvDN7CiH2D1RaVF7xmIYMWpUNAgf/6Bbxgg28cHAXZM8GNEBUMC4ie6hVav/KHgEqwgcnv9xw8HzEmoMwOnv8PiXYIo8e3HvH7x7GVhpT0fq1TuvazJ8Gd+NwvKkhoDGOlqgcd+c6VkQIwgBxQyPFvWP8Y9pznzhMurBl+Kfich8rDYU7BDv3dYtOK3xwdyvXxvj3EstZbtDpMLilJjpY2Lpgy9atWHam4k7DirU2PsuHIHO86Wz9NBwjfLDoOJtExuXWtpK1ykxLsAHl49nh+DtWBELmroO7sy1/T8fhsPF7jmMvLxidQ7wQ44QzliUc4cz5y/Hp4fg4K/WUM5WWj7RVgce9PjJ+r6XTI2xZXm5pJf7QSvNIrW5rQfywfm8LacCIyg8G96x0TgixH6DSpzGhh0uvC2Fz0HiuVtnAIntY3a/GoVae957BvSadq3Hx4D5m5fpeqFxjo8ozERktapVgbjhyBQ9eifMMFyxTROslz6RRvtDqacz5VyW/Vn5EaIxoiCNTDcFTrTRiLnTctcgCH2L8428Xtipk4nFPXBwajZgWOW8Ai9bfbHnPXVYsHoTnYaNfBAvE76ycdwFKOiBCsZLgF/Ob6zmHeHJLtLOwdcGWOwg8y5mKOw1sLmdOjjf5gGUrEoXFlMggrp+0peUsQ3x+ZqWMImTOGP25J2mFGKrFIcYN0bzpvcCCGMOZ49gLAuk22XPgC7YUHVjhiC95l/OXcCIiHeIfwzKVlk+xVUFzB1tOkZjKa/iMlc4ZTL2nztS7mdkTwUa4nxeOaR/oHFwS/IQQ+wl6evTQI63KhoaQipwKnR4135nHtQnmclDZO1QCWGxoCGv8eHD3H78fZKWyeNfydJMeIehQqXnjy5Dn26xU3FgRIwitWGkjELwX3SPYGFZAHDle8dbS+BwrIvNOVuaQOLVrM4vB/dOmh0Sdew/uq1aGxniWM9VotgQbDTh5mwUbjb1bNigvcwQbcWB4Kc8li+FDPN0xHDPfKIqjHkjraAGDmkCPYY5hWFhJP8LpDSQWF0QCYbvAVgXnVNz5/fetpJenJ+8m+DN5DmEmfTjvw4nHW5mz5bREBnPRXh6OETWUM7fkQavMTFnYgDRzfz5z3mVI92jl8ziSDrk+moI6KZMtX4goT8ucv0dbSXOHd/X14biVlg7l9FQrFlLyxN+/nE68J5znk45BFP6tNI/UBBtDvrnDANsINsRmtuxHKGte3oQQ+5CfW2kUvMdMZcBCg6dbeSlzZZNZWL2iqME8JEQOeKXpYN2J85SwEjGsV6sYqNyz9QKOtNKIEV53CK84zwXRRPxuPv6G52DBo3L98+jn1EQL119qJZ1eGvx5FmnV4hhbzo1yLhs/cxq/woqQcoivz4nJ12YQDd7o0MB4o1FrCB5rq/MCP2DLMDIE2aIl2Dz+WbBta2Gjd4/Qcc60pajyvEFEH26reY7jOs9zrBeUb+YR1sDCHOccOcQxz7uKYiSWj4X1vweAiPG8ycyxsAH3oRODGM75kkUG1/7S1udrAmWbOsAhPhdZsYAx/E+YL7d2RwMLJPfH2kQ4OHeEFQHJb2vPpKzGTgwQR36b05PVuNwnvs+n2bIzQAeLMBG+942/OcyKBcvhXcfCxrDxF209nZ9p5fe4LDRzWvaS0ylCOaX8ObX3NHMXK3E/wYp1nu/Uc7lOhaOtdHpJH+LMe4BlMXYC5kIe1+YECiH2ITQUzF1j4i2VAC85lgqvbBASXpnVHD1Ftwjk+WZZeDGvaZH8HCqEOT3riE8Cd4jTVA8zWmKoOGmQnFrj2CIKlgy9/MdlT1tWmKfYMr1oQGg4W0xV/lhHopWBY/KC9MwNwadtPU/g4PFzd/RMRMHGPXZbea7HPwo2/LJg87hOxYVGyTne1vMw5g3xzI17L1hvX5s9RyhLOXyEw+NOGLjmyVYEXy0MiAwXFNHxW4RQjZZgu4etD3VvwjtITkzXHh5lpRMU+ez4WQtjXmU+BfXJ8dnT5r13uVzXoC6hk4YVP75b5K3P1e2hZbX9lpU8pTzHji8C+sVW0iuXIyA80aoNPfFxpuqcbaGuQNBSPxB22gGGkXFRKON6Fy0IIfYCTDrPQokKAXG108ypmOay25YN/IPD98w52cPKZHcqLYgNh1dSzFOhcsYChUClYmZYg2e0Kk+/n8PvTx6/Y1XM89Qc7p+HfxmCzWLYeUv2sNJAuaBZrJ76Px+yMveLStoFBRPmW89B2NIYnWbLBjo2HlGwEV4shJx358NuU4It8hwr1gTSiYaXBrHVqDO0t7BlHHoblXtZCbdbm3GkiU9i5z7eMeEc+YbVyfN2YXXB1qIVfjjMVjtCWEZ4Fkz97gwrFknizrAc5TXmxZ7AtIUYJnfbWmlYvbsre45MxTEzVa4z5BXx4H2l/H5q9fT/eYctFwFEFtmjQk1E1cr5+VaG7jNz4lN71t5gU6dXCLGPoRFlvk1+MWs9UCq+OcMDWCG8AXHHvDesEi4QqHhoAE605fyd7GJjyrU03C28ocIawry5bcgNx1SDPKfy/FM6zqsJnTn33MRUQ4CVKVtL5uQvEFa/R69IqDVkDnOBEGjH2rrVFHLeAJbMN4ZjymlO6ynyMDvxQfD3sLB6+TjYlhPcs9jB+jaXWrwdOhP5/Y35+BVbf6dwdD7ie1XLv1qjHcPC1Ip4T0RRfF/93pR18mWKqThmpsp15nQrw+fxOA8hO3PCEKm9s7mcvy58z7TiQ0c6dqhwzMdDgHr6XmYljRmC/mbwz3mb3SZqeS+uwpxmpcBgYvWeYi/08vndm/KJBkx8d1FAQ43zY87B7uAXocdDWBEXvUQRgtu9cvbKBQ1U74s5t0Hf1/RURJuYU2lTIec5Ly1i2Gi89rdgu4OtC7bfp+NNEFYvO71pT9y2tdDU8uZoW50sTSekZilpkcNNmvSGb2Fti+Sc92oTtXg7CNb8nJ+k422pzeebI4bnMBXHDOUa4dID1l7KiMMctlZnbk4YIrHj4swp58SHodIDCcpUS9iKqxgMO/lcDRqnWCne0/qGLGhQ5rxAVNKxp83eV7lRZM4N4eEFIUzeA2LCbK2R5CXMFbqzsDIPyaHHyvyMHjZt7LkvOdTWe1+tXhiTemPvjTSj19eymOxrWCWae5g4Jtr3ssgeE9zMStnpYZeVNKWc8lkbGnEYessWEdw2xHciQthrVs1t+VH2aMA71RI5m/hc9hhhWPgKK2nLpw+/9sAE8JwGrQY9M9XIUs+Rz7ksTi3saIElqwX15AW2Gv64kGdP4L3O98ZRh+40U3HMMPk9C8kpfmtlcRFWz6kOFhs2s+Aix9e332hBe8ZCiwjlfE46nZI99jMINuoIcTUgN/ax0WB+SG0YIUNlMUew8VJdHo4PsxKOuJEm+3rVoHDWBNsUC1vtVdEbyfFuMfdZQgghhBA7Dj1d5kblZcB3sSJqmMvk86SYII15m95qXAKeBRu7ZDNptGUtodfOvV0MIs4utaVYpLeAiIPdVoZBfZ6MCzbu4ZOlCRfDnfSwaixsVbAxlyTurVOLl88Zu9DKvd3SwLVcR5iEEEIIIfYJCJM4tMbyYId5UNHCxhCBC5+4P00UbMfZcmPIl9jqX4dEWILNeUCARatbNoUjKn0oL1rYCJ8PqWDSblnNFrYcUiKc56+cbccrW/PwZ+IoMOfhx+Gcc4atD61EhxAWQgghhNia+1oRPf73IVmwObttdRPIKNj+YUWkYZU6wdqTahluZVIs1jTmdkSrm+8j5HDvKNjOtPqk+inB5oLMhZ2LsshuW41XFmxY4djk0RcwtJ4nhBBCCLGj5DlaiBJfyeSCzSf2xqHAhdUFG4sHeia2M7SI4PlA8EPAsUlmnkicBRvDlOyIj4u0BNTCVodEse7F41a8omBDxJ5n6yuMMqQXYW05BGONXVZW28rJycnJye0tJ67E5NWZ7AXkS5xdsLlIiYLoUivCBlETBRsiKoqac8P3DPdHBDlY3WqiKws2vz9DqIeO36H2W1jYapi4H35wjLXjFQUb8/jYyTyukHpP+C7EVZ3aPy+0oGPS6pxMMWfVKMwJkxBCXKn57ujYSJFl0vG/CxEpf7PlDu2vtLLBJLuZu9BhZafPf1uM1zEHjaXZ7BU1VWkjog4Px1jdFuEYOPb7++pOHL/174gq/+7C0XH/eO7e4zG9DURYLV40HIT9CitLzT0eD7eyYAEr3a1GPyGuDrBPYmu7Dof35NjxO5vr9m6lEvmMlT3LemCLBuqtA4nPW/1fOoQQQgghdoSLbXWRDJ0XVooDVm63ODsIMu8Q3XP0u78tLdQ+vaLG6VbmjH7aSsfIO0V0xjZtBHrU+MkIwCL4Z1iBTth6YCW67+XFHFU26Ob4y1bu0bMnJfCbPF1DCCGEEGKvgBiK29/UBFuNOKWgJdiYpxr/9YA5or65bU2wPcKWC6CYsuH/kLBJsEGvYAOe3QpzD8cN7htWtgRi+yAhhBBCiL0KW9yw1yFzS7E4vdVWBRtb1PiCnafbUhj1CDascHGTbqZW+NBmTbBFGDL1He0PJMFG2jwvHDO/7qeDuyT4CSGEEELsGGcN7lNW5nQ6UxY2hjefMH7vEWzAPobMd8USxeInX3CQBRvDpYguPplrG61+2wo2nlX70/ptBBvbEkVrYQbhpsURQgghhNhREGu7xu+vGNy3xu8twbbLyv6LiCCsZPzXYo9ga5EFWyRubA09gu12ViyEzMVjzhzfWexU237oaCtCknlo37Yyj48FSYg+hmK3gbl5+Z9khBBCCCG25ju2vrL7RVY2tq4JNibis1ABscb+iLDJwsYwKoLoo1YEESvREUS/HNyrrPxTSk2w8bs7Jb8ewebMubYX0opV9iycYNU5YpB/i8H5BtvuehctCCGEEEJ0wb+J5KHEmw3upHB8EytDoc4DBvd62yzYIjURVbOwnW/leZna71vMuXZP6Im3EEIIIcSOkAVb5gbZY2SnBdvrwvdM7fdwXSvz3bDkuUNcslm3b1nCSlPiePbgvhn845YmNbeJnngLIYQQQuwIPeKkBmKLbTt6hAuCKw+zItjYELcHfu/bgRwoEOdsIRRCCCGE2CucbEVMRSsVLv/XbwtEC9uCbOLR6RjBc0jym4JFDgcShJ/hYyGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCdPA/hxPfReXqxbAAAAAASUVORK5CYII=>

[image17]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIcAAAAZCAYAAAAbiz05AAAFFElEQVR4Xu2Za6imUxTH/0K55TYY15zBKBmU2xTK5BaJD6hR5oP4gJIP5FqKfJpEQkgYkiISMUYST5SUyXyhKVHIpQjRUJLL+rX2Os8++zzv+z7vofd9y/7Xv3OevffZt/Vfa6+9j1RRUVFRUVFRUVFRUTGrOMv4ZcY3jY9mvNK4bL715JHP7+ZUtqvxWeN3xs+NB6TyEpuMPxlfkq/lW+N64+55owxd5fsady4LpwTmsV1Z2APHG1cadywrRuEg4yXGb4x/G99K3/Am40epvGvjJgHmd5nxY7Xi2MG4xviX8QstFgebgAhWa+FmsrlXGLcaz8jKA/T/qfEpuZieM35iPDxvNAWwnjONW4y7FXXDsL/xRfl6Xjb+YLx2QYueaOQiCAMEmNgGeUTZo6ibJJhXOTeEUYqD+T6SOAhHGD8sC+X9swc55/IGU8CP8nn8kn72FQe2wmYfZGUXG//IvnujUbc4AKGduqvKigmirzjWGR+Xi+RI+dHym/Er41q1keRoLTY8/d8vjxp3yv9+2lguX8sFGk8cl8rbE3UDOxk3GldkZb3QaOniYFAMNGzie8rb8LMEi2cTYiO60EccFxqfkAuAuZBvrEp1YM74mdwLjzO+Ydwnqy/7nyWMIw72g3351XhCUccaHyvKRqJRtzgwFp7UdayQGOJpeOarxj/TN+WBOeNrxt/lZ9/PxveMB8tzh1vkieUzxneN24w3aLFI+ojjNrUCRtB4CcINsLGN2k3jPD4pq6d/+rpdvmZ+zgrGEQdrY42DxFHuy0g08sHvkm/QOfKbyjtyo+cGB0wSo+OdJ6cywjZJ4n1y7z1UntBBficy4LmMc73xKHmSxPd56W9uTd8IJEcfcSA+NhEgktJDSnHk7QH9v208Vz7fu+UJHPMaBOpOUZvE9+H5Wryfo/BfiqNRv37m0cgH3yz3Gs5tNh5h3Ng2m8fV8vYPqt28veQJEOf7CuMrqQ3nH2BCZM0I6mx5JNpk/F4e5kEIhttJjqWIgyiWY5Q4LtLC6Ej0Yv0cV4PwvxJHbgCufk+m8jLMc8xQfp3cOPBAeagmIz5NPjkMjcH7gDEQyddyo+foI47yWHlBfnQFSnEQWWg3DKzxdU3/rWPmxAHCkzkGcsTxkHteCepz45WIyEG7h1JZJFNLEcd+8mNhVfomQvFYFl76vPzYI0ci1+AdIzbpGHm0Wpa+A8yta5MnjXHEMSohJWKOhUbd4oiByvN7o7rb52BycTPoArkJfdB3eHgujlONe6fyPuIAXGUxen6VRSS8sK6Vh3SS4m3GE9PfAPpmLmuyMkAZjrC8KA/sIk/GadeXHKNcpcfBOOLAGYjsOEIZGdnrQbfOgWjUbewwFoOFB/JqyfnM4GXI5Xc8lCQ1cg6SuhwkfE+rHTOPPng9xmRMnr1D+X3FEY9g92ZlfUBCzK2pPD6ZX55XTQvDxHG68X3jNWrnyZ7TvuudIyJrb2yRd3aPFm4QxkYA/F/isFSGkWjzsFwg3DAAE7vc+ECqJ1TjsRg7FMxRwgRJSCNybEjto0+SQMYjf+FYo5x53WHcXi0wJvlJ+bxN+/XGY9VtVKIA3rNZ7UNXzCtvj8DjpjVNsJ64APAEUCLyPyJSrId2W+W3zcBqeTTv2pN/BTyYWwdKLDcLg+G9XaoOUEdOkBs3EI9ouSiH9TUO6BMx0H/XA1wJjhrWyFr7JtKzDNbPerglHVLUVVRUVFRUVFRUVMwu/gEOcWJJvXQl1QAAAABJRU5ErkJggg==>

[image18]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADsAAAAaCAYAAAAJ1SQgAAACUklEQVR4Xu2WP2gUQRTGv2ACioJ/MREVg6QREQsTJJJSFAnRRjBgkUq0sBMUxcJCESxDsFBBLEQFS9MJuZAmIVUKsRKjIAEhpIk2ovH78nbI28ntXQy6azE/+HF3M7N7+2bfvBkgkUgkEv8X4/QzXaSvor4q2UD30RN0W9QnWuhu2kv3wMY3RRc9pz9oX9RXBXqe6/R09n0rfUmPujEK8jXdlP1WoPdpZxhQxC76js7SvfmuSjhLf7rfx+g3etK1XY1+i0N0BDZBhfTQ77CZao36ymYLrdF519ZGL2WfIoxRcB6lsl6aXl4hl+kSveHadENZNlpGWk4TcYfjIJ2DBefR8yoDlAmF+BTuoMfpNayegJgd9Bw9v0b76eblK4t5Bvvf97D7KyUvwCYgpKfS9xfqB6trB6L2HLrRKO2CFaqddAZ24aAbF/Mvg11wbVpaWmKqukLBaMy6gtWAMfqGHsjaFLjSYU3l/C8Sgo3TWO3D2fczWGewSg0NkF/o3Xx36TyBPYsyzaPlVIMFFKrzHwerSuyr8C2sDNba1YZexBFYuoXJauZHun/5ymJCgapF7Xqr4Tm302nk912h4GfRYPtUJfZFSDdVAdAbf4jyDxk6QEzCimYgHHp8/biD1c+mregFGmyfSht/0T1YmhyGHR2r2H6uIH+o6KQfYBMRUE15ipW9VxNyE5aNdQmbs45eAaXmGJ2i3a69TBTAbfqIPqCf6NvcCOMr7E3qjT+GHYwanp7qHbDb6ca4sQK0XV1E8a6gbewUHco+m21riUQikaiU35csd92W4YEfAAAAAElFTkSuQmCC>