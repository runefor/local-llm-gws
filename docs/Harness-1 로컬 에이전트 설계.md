# **제한된 로컬 하드웨어 자원 환경에서의 Harness-1 상태 외재화 메커니즘을 적용한 고성능 RAG 검색 에이전트 구축 및 아키텍처 설계 보고서**

## **1\. 요약**

일반 사용자 개인용 컴퓨터(PC) 환경인 제한된 물리 자원(RAM 8GB/16GB/32GB, GPU VRAM 6GB/8GB/12GB)에서 정밀한 도구 활용(Tool/Function Calling)과 대규모 검색 보조(RAG) 작업을 매끄럽게 처리하는 자율 에이전트 시스템을 설계하는 것은 현대 인공지능 엔지니어링의 핵심 과제이다1. 과거의 전통적인 대규모 언어 모델(LLM) 에이전트 아키텍처는 에이전트가 탐색하는 모든 원시 검색 이력과 검증 경로를 프롬프트 하단에 누적하여 밀어 넣는 '추가 전용 트랜스크립트(Append-only Transcript)' 방식에 전적으로 의존하였다3. 이 방식은 추론 단계가 거듭될수록 신경망의 컨텍스트 윈도우를 급격히 잠식하여, 질의 누락, 이전 의사결정 정보의 왜곡, 동일 후보군으로의 무한 루프 반복 탐색 등 '검색 건망증(Search Amnesia)'과 정보 왜곡 현상을 발생시킨다4.  
최근 공개된 20B 체급의 자율 검색 에이전트 모델인 Harness-1은 '상태 외재화 하네스(State-Externalizing Harness)' 프레임워크를 기반으로 이러한 인지 병목을 획기적으로 개선하였다5. 본 아키텍처는 어떤 도구를 호출하고 무엇을 검증할지에 대한 순수 고차원 인지 판단(Semantic Policy)만을 신경망 가중치 모델에 일임하며, 후보 문서의 보존, 데이터 중복 제거, 중요도 기반 큐레이션, 검증 레코드 유지 관리와 같은 정형화된 정적 상태 보존 작업(Working Memory Bookkeeping)을 신경망 외부의 소프트웨어 하네스 레이어로 정교하게 이전시킨다5.  
본 기술 보고서는 사용자 하드웨어 자원별 한계 제약을 극복할 수 있는 2026년형 최신 경량 모델군(Gemma 4, DeepSeek R1 Distill, Qwen 3.5/3.6, Llama 4 Scout, GLM-5 등)의 물리적 양자화 성능 지표를 분석한다8. 또한, Harness-1의 Mixture-of-Experts(MoE) 기반 구조와 Clipped Importance Sampling Policy Optimization(CISPO) 알고리즘을 분석하고, 20B급 모델의 로컬 직접 가동 여부를 검토한다6. 최종적으로는 다양한 2026년형 최신 모델들을 상태 외재화 하네스 플랫폼에 접목하는 소프트웨어 통합 아키텍처 설계 제안과 오픈소스 구현 가이드를 제공하고자 한다15.

## **2\. 사양별 추천 모델 및 양자화 가이드**

로컬 하드웨어 구성에 맞춰 추론 속도 저하를 억제하고 정밀한 툴 호출 정확도를 담보하기 위해서는 시스템 하드웨어 사양에 따른 정교한 모델 배치 전략이 필수적이다1. 아래의 정량 비교 표는 세부 RAM 및 VRAM 물리 결합 조건에서 실행 가능한 최적의 2026년 최신 로컬 오픈소스 모델들과 이들의 양자화 정밀도별 VRAM 사용 오버헤드, 예측 추론 속도 및 툴 정확성 평가지표이다8.

| 하드웨어 구성 (RAM / VRAM) | 추천 로컬 오픈소스 모델 | 양자화 규격 (Format & Bits) | 실질 VRAM 점유량 (KV 캐시 8k\~16k 누적 기준) | 실측 추론 속도 (Prefill / Generation) | 핵심 툴 정확성 및 한국어 평가셋 성능 지표 |
| :---- | :---- | :---- | :---- | :---- | :---- |
| **RAM 8GB / VRAM 6GB** (보급형 노트북 및 데스크톱) | **Qwen 3.5 9B**8 또는 **Qwen3-30B-A3B** (MoE)20 또는 **Gemma 4 E4B IT**9 또는 **DeepSeek-R1-Distill-Qwen-1.5B** \[cite: 21\] | GGUF Q4\_K\_M22 또는 QAT Q4\_018 | \~4.1 GB \- 5.3 GB20 | Prefill: 1,300+ t/s Gen: 35 \- 55 t/s20 | **Qwen 3.5 9B**는 Gated DeltaNet 구조를 활용해 긴 맥락에서도 VRAM 폭증을 억제하며 한국어 지시 이행력이 우수함8. **Qwen3-30B-A3B**는 단 3B active 파라미터 구조로 6GB 환경에서 최상의 속도를 냄20. |
| **RAM 16GB / VRAM 8GB** (중급 메인스트림 그래픽카드) | **Gemma 4 12B IT**18 또는 **DeepSeek-R1-Distill-Llama-8B**25 또는 **Qwen3-8B**26 또는 **GLM-4.6V-Flash 9B** \[cite: 27\] | GGUF Q5\_K\_M18 또는 QAT Q4\_018 | \~6.6 GB \- 8.5 GB18 | Prefill: 1,800+ t/s Gen: 45 \- 65 t/s22 | **Gemma 4 12B**는 MMLU Pro 77.2%를 기록, 구형 27B 성능을 추월함18. **DeepSeek-R1 8B Distill**은 o1급 수리 논리력을 제공하며 자가 디버깅 능력이 압도적임12. |
| **RAM 32GB / VRAM 12GB** (고효율 RTX 3060 12G / 4070 SUPER) | **Llama 4 Scout 17B**10 또는 **Qwen 3.6-35B-A3B**20 또는 **DeepSeek-R1-Distill-Qwen-14B/32B**21 또는 **Gemma 4 26B-A4B**9 또는 **MiMo-V2-Flash 309B** \[cite: 19\] | GGUF Q4\_K\_M32 또는 EXL2 (5.0 bpw)33 | \~8.5 GB \- 11.2 GB10 | Prefill: 2,500+ t/s Gen: 50 \- 90 t/s22 | **Llama 4 Scout**는 10M 초대용량 컨텍스트와 고정밀 다중 도구 호출 프로토콜을 완벽 탑재함34. **DeepSeek-R1 32B Distill**은 4090 미만 환경에서 가장 강력한 단일 추론 성능을 보장함36. |

### **하드웨어 병목 및 버스 전송 대역의 실질적 영향성 분석**

로컬 환경에서 추론 속도(Tokens per Second)를 제어하는 궁극적인 물리적 병목은 그래픽 칩셋의 연산 성능(TFLOPS)이 아니라 VRAM 메모리 대역폭(Memory Bandwidth)이다2.  
예를 들어, 12GB VRAM을 제공하는 지포스 RTX 4070 SUPER는 192-bit 버스 폭에 기반해 최대 504 GB/s의 데이터 대역을 확보하는 반면20, RTX 4060 Ti 16GB 카드는 128-bit에 머물러 물리 전송 가속 대역폭이 약 272 GB/s로 제약된다20. 이로 인해 12B\~17B 크기의 가중치가 메모리 연산 유닛으로 스트리밍되는 순간 속도 저하 현상이 128-bit 그래픽 카드에서 더 두드러진다20.  
또한, 추론 가중치가 완벽히 GPU 메모리에 수용되지 못하고 일부 레이어가 시스템 일반 RAM(PCIe 인터페이스 경유) 영역으로 누출되는 슬라이드 오버 현상이 일어나면, 전체 추론 속도는 초당 2\~3 토큰 레벨로 급감한다17. 따라서 모델 크기 선정 시 물리 VRAM 잔존 용량을 대략 1.5GB 이상 유지하는 예비 공간 설계가 강제된다1.

### **2026년 최신 오픈소스 가속 동향 및 프레임워크**

#### **QAT (Quantization-Aware Training) GGUF**

2026년 상반기 도입된 사전 가압축 기법으로, 학습 단계에 양자화 손실 편차를 모사해 보정한다32. Gemma 4 12B에 QAT Q4\_0을 적용하면, FP16 대비 미미한 지표 하락만으로 VRAM 요구량을 3배 이상 단축시켜 단 6.6 GB VRAM만으로 플래그십급 추론 정확도를 보장한다18.

#### **MTP (Multi-Token Prediction)**

최근 Unsloth 및 llama.cpp 진영에서 표준 가속으로 자리 잡은 다중 토큰 동시 예측 기술이다9. CPU/GPU 버스 통신 오버헤드를 우회하여, 로컬 구동 속도를 정확도 무손실 상태로 약 1.4배에서 최대 2.2배까지 안정적으로 증폭시킨다9.

## **3\. Harness-1 기술 심층 분석**

Harness-1은 20B 규모의 검색 제어 전문 추론 신경망으로, 복잡한 증거 탐색 영역에서 기존에 시도되지 않은 상태 보존 기법을 독창적으로 해결한 기술적 기준점이 된다7.

### **gpt-oss-20b 기반 Mixture-of-Experts 아키텍처**

Harness-1은 OpenAI가 2026년 2월에 오픈소스로 공개한 gpt-oss-20b 베이스 모델 상에 고밀도의 정렬 미세 조정을 주입한 특화 인프라를 활용한다6. 해당 모델의 신경망 레이아웃은 24개 레이어로 이루어진 트랜스포머 디코더 기반의 믹스처 오브 익스퍼트(Mixture-of-Experts, MoE) 구조이다13.

* **총 매개변수 용량**: 약 210억 개(21B)13  
* **토큰당 활성화 매개변수 용량**: 약 36억 개(3.6B)40  
* **라우팅 네트워크 레이아웃**: 총 32개 전문가 가중치 블록 중 소프트맥스-시그모이드 기반의 Top-4 전문가 게이팅 활성화를 병렬 집행함13  
* **컨텍스트 윈도우 한계 폭**: 총 128,000 토큰(128k) 대응13  
* **어텐션 및 토크나이저 아키텍처**: 회전 위치 임베딩(RoPE)과 슬라이딩 윈도우 어텐션(SWA, 128 토큰 윈도우 대응)의 교차 적용, GPT-4o 계열의 o200k\_harmony 토크나이저(어휘 사전 크기 201,088개) 활용13

### **상태 외재화 하네스(State-Externalizing Harness) 메커니즘 분석**

Harness-1의 혁신성은 '상태적 인지 오프로딩' 원칙의 철저한 하드웨어 분리에 기반한다6. 모델이 자율 검색 과정에서 스스로 기억해야만 했던 수많은 이종 정보들을 신경망 매개변수가 아닌, 가상 런타임 호스트 측의 제어 공간인 WORKINGMEMORY에 영속 보존하여 갱신하는 특유의 구획화를 이룩하였다6.

\[자율 검색 에피소드 루프 진행 구조 대조\]

■ 전통적인 Append-only Transcript 방식 (컨텍스트 폭증 유발)  
  ┌─────────────────────────────────────────────────────────────┐  
  │ \[Prompt\]                                                    │  
  │  질의 \-\> 도구호출(Query 1\) \-\> 원시 응답(Text 5000자)        │  
  │  \-\> 도구호출(Query 2\) \-\> 원시 응답(Text 3000자 중복 문서)  │  
  │  \-\> 도구호출(Verify 1\) \-\> 원시 응답... (컨텍스트 한계 도달) │  
  └─────────────────────────────────────────────────────────────┘

■ Harness-1 상태 외재화 방식 (정형 관리 영역 오프로딩)  
  ┌─────────────────────────────────────────────────────────────┐  
  │ \[Harness Environment (Externalized Host Side)\]              │  
  │  \- Candidate Pool: \[Doc 01, Doc 02\] (MinHash 중복 필터링)    │  
  │  \- Curated Set: \[Evidence 01 (Tag: very\_high)\]              │  
  │  \- Verification Registry: \[Claim A (Status: Verified)\]      │  
  └───────────────┬─────────────────────────────▲───────────────┘  
                  │                             │  
       (Compact Prompt 렌더링)             (JSON 구조화 액션)  
                  │                             │  
  ┌───────────────▼─────────────────────────────┴───────────────┐  
  │ \[Policy LLM (Harness-1 20B)\]                                │  
  │  \- 현재 축적된 요약 테이블 및 검증 표 인지                 │  
  │  \- 차기 인지 액션 결정: {"action": "grep\_corpus", ...}      │  
  └─────────────────────────────────────────────────────────────┘

전형적인 에이전트는 원격 검색 도구로부터 회수된 중복 텍스트와 불필요한 헤더 구조를 원형대로 컨텍스트 윈도우 영역에 지속 가중 축적하여 추론 비용을 기하급수적으로 폭증시키고 의미 추론 레이아웃을 파괴한다3.  
이와는 대조적으로, Harness-1의 하네스는 외부 환경 레이어에서 텍스트의 구조적 유기성을 전적으로 보존하며 필요한 부분만을 정형 행렬(Matrix) 데이터와 유사한 상태 포인터 형태로 관리하여 모델의 추론 부담을 완벽히 소거한다41.

### **하네스 핵심 구성 컴포넌트 기능**

#### **2단계 중복 제거 (Two-level Deduplication)**

외부 검색 결과 유입 시, 하네스는 해당 청크의 고유 ID 분석을 선행한 후 추가적으로 MinHash-LSH 알고리즘 및 SHA-prefix 콘텐츠 지문 대조 메커니즘을 2단계로 집행하여 동어 반복적이거나 구조적으로 90% 이상 중복되는 잉여 구절의 내부 융합을 원천 제어한다41.

#### **문장 수준 BM25 기반 압축 (Sentence-BM25 Compression)**

수집된 문서 원본에서 목표 키워드 및 현재 검증 가설 질의와의 의미적 밀접도가 최고점을 나타내는 문장 단 4개만을 고도의 정밀 가중치로 선별해내고 나머지 텍스트는 호스트에서 소거 처리하여 입력 길이를 혁신적으로 유지한다6.

#### **웜스타트 큐레이션 (Warm-started Curation)**

에이전트가 최초의 유효 정보를 탐색하는 시점에 하네스는 해당 정보를 기준으로 재순위화된 상위 문서 8개를 선제적으로 큐레이션 세트에 정렬 및 자동 시딩(Auto-seeding)한다41. 이로 인해 극초반 차가운 시작(Cold Start) 단계에서 발생하기 쉬운 중복 도구 방출 오버헤드를 완벽히 단축시킨다41.

#### **예산 인식 컨텍스트 렌더링 (Budget-aware Context Rendering)**

검색 실행에 할당된 전체 세션 타임아웃 예산 및 토큰 버퍼의 남은 길이를 정량 연산하여 프롬프트 템플릿 내 표기 공간의 조밀도를 가변 조율하며, 한계치 초과 시 즉시 현재 증거만을 결합하여 결론을 도출하도록 유도한다41.

### **자율 에이전트 전용 강화학습 기법 및 CISPO 알고리즘의 우수성**

Harness-1의 의사결정 정책 모델은 지도 미세 조정(SFT) 이후 혁신적인 온필기(On-policy) Clipped Importance Sampling Policy Optimization(CISPO) 알고리즘을 적용한 강화학습 단계를 통과하여 고도로 다듬어졌다6.  
![][image1]  
여기서 $r\_t(\\theta) \= \\frac{\\pi\_\\theta(a\_t|s\_t)}{\\pi\_{\\theta\_{\\text{old}}}(a\_t|s\_t)}$는 중요도 샘플링 비율이며, ![][image2]는 해당 의사결정 시점의 Advantage 가치 점수이다43.

#### **GRPO/DAPO 계열 알고리즘의 내재적 문제점과 CISPO의 극복**

전형적인 GRPO 최적화는 정책 비율의 폭을 상하한 경계선 내로 직접 클리핑하여 지나친 분포 이탈을 규제하지만, 자율 에이전트 학습 시 치명적인 역효과를 초래한다14. 복잡한 다중 단계의 탐색 추론 시나리오 도중 논리의 흐름을 유연하게 선회하거나 의심하는 행위, 혹은 오류를 정정하려 시도하는 반성형 토큰들(예: "However", "Recheck", "Wait", "Aha")은 사전 기초 정렬 모델 관점에서는 확률값이 대단히 희소한 고엔트로피 극소수 토큰에 해당한다14.  
업데이트 초기에 이러한 토큰들의 확률 밀도를 정책이 상향 조정하면 ![][image3] 수치가 폭발하여 일반적인 클리핑 알고리즘 하에서는 그래디언트 기여분이 차단 및 소멸하게 유도된다14. 결국 에이전트는 기계적인 반복 검색 행위만을 주입받게 된다6.  
CISPO는 가중치 클리핑 마스크 연산에서 파생된 그래디언트 차단(detach 연산)을 통해 극소수 토큰의 폭발을 막는 한편43, 업데이트 그래디언트 계산 식에는 ![][image4] 항을 그대로 잔존시킴으로써 고엔트로피 사고 조정용 소수 토큰의 그래디언트 흐름을 끝까지 보장한다43. 그 결과, 에이전트 정책은 이성적으로 자가 검증을 집행하고 막다른 탐색 경로를 마주하면 유연하게 검색 질의를 정정 재생산하는 자율적 문제해결 태도를 스스로 수립하게 된다14.

## **4\. 로컬 환경 적용 방안**

### **20B 크기 Harness-1 모델의 직접적인 구동 검토**

Mixture-of-Experts 가중치를 채택한 Harness-1(21B params)은 단일 배치 추론 시 활성 파라미터가 3.6B 수준으로 경량 구동되어 메모리 연산 점유 효율은 매우 이상적이다13. 그러나 물리적인 전체 가중치 파라미터가 디바이스 VRAM에 탑재되어야 고속 추론 연산이 수행되므로 로컬 직접 로딩 장벽은 상당히 높다44.

#### **VRAM 8GB 이하 하드웨어**

GGUF Q4\_K\_M 규격으로 강제 가압축을 진행하더라도 가중치 순수 점유율만 11.8GB를 나타낸다45. 이는 가용한 한계 영역인 8GB VRAM 공간 내에 적재할 수 없음을 뜻한다44. 반강제적인 CPU 레이어 오프로딩을 수행하는 순간 PCIe 전송 가속 병목으로 인하여 한 번의 에이전트 액션을 호출하는 연산 지연시간이 분 단위를 초과하게 된다1.

#### **VRAM 12GB 하드웨어 (RTX 3060 12G, RTX 4070 SUPER)**

GGUF Q4\_K\_M 혹은 MXFP4(OpenAI 기본 FP4 MoE 가속 지원 규격)를 적용하는 경우44, 이론적 로드는 보장되나 극도로 가혹한 병목 상황에 노출된다44. 에이전트 시스템 가동 중 툴을 교체 호출하고 다중 텍스트를 파싱하는 과정에서 로컬 디바이스의 KV 캐시 점유 영역은 128k 문맥 대응 시 가볍게 수 GB 단위로 치솟는다47. 이 과정에서 KV 캐시가 VRAM 상한 임계선을 넘어서는 순간, 시스템은 즉각 추론 불가 상태로 동결되거나 급격한 레이어 축출 연산으로 변환되어 로컬 응답성이 완전 붕괴된다48.

### **대안 아키텍처: 2026년형 경량 고성능 모델군 기반 상태 외재화 이식 설계**

이에 대응하는 대칭적 우회 설계 전략으로서, 한국어 최적화 및 고효율 툴 호출 역량을 확보하고 있는 최신 가속 기반 모델군(예: **Gemma 4 12B IT**18, **DeepSeek-R1-Distill-Qwen-14B/32B**21, **Qwen 3.5 9B**8)을 정책 코어로 삼고, 그 외부에 상태 외재화 하네스 메커니즘을 파이썬 백엔드 모듈 계층으로 설계 구축하는 '하이브리드 결합형 에이전트 시스템'을 제안한다15.

┌────────────────────────────────────────────────────────────────────────┐  
│             로컬 RAG 에이전트 외부 제어 환경 (LangGraph / Python)         │  
│                                                                        │  
│  ┌──────────────────────────────────────────────────────────────────┐  │  
│  │ 1\. State Table & Working Memory Tracker                          │  │  
│  │  \- candidate\_pool: Dict\[doc\_id, body\_text\]                      │  │  
│  │  \- curated\_set: Dict\[doc\_id, priority\_tag\]                       │  │  
│  │  \- claims\_ledger: Dict\[claim, verification\_state\]                │  │  
│  └──────────────────────────────────────────────────────────────────┘  │  
│                                   │                                    │  
│         (MinHash-LSH 중복 제거 & BM25 핵심문장 압축 필터링 집행)       │  
│                                   │                                    │  
│  ┌──────────────────────────────────────────────────────────────────┐  │  
│  │ 2\. Dynamic Input Render (Markdown Table Builder)                 │  │  
│  │  \- "현재까지 축적된 외부 큐레이션 및 검증 상태의 간결 표 렌더링"      │  │  
│  └────────────────────────────────┬─────────────────────────────────┘  │  
└───────────────────────────────────┼────────────────────────────────────┘  
                                    │  (Compact Prompt String)  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│             로컬 추론 가속 엔진 서버 (llama.cpp / API 호스팅)              │  
│                                                                        │  
│  ┌──────────────────────────────────────────────────────────────────┐  │  
│  │ 3\. Lightweight Policy LLM (QAT Q4\_0 / RTX VRAM 적재 완료)        │  │  
│  │  \- Gemma 4 12B IT (MTP 기술 적용, 초당 120+ 토큰 추론 집행)          │  │  
│  │  \- 또는 DeepSeek-R1 Distill 14B/32B (Thinking Chain 제어 로드)     │  │  
│  │  \- 차기 인지 액션을 결정하여 JSON 형식으로 출력                    │  │  
│  └────────────────────────────────┬─────────────────────────────────┘  │  
└───────────────────────────────────┼────────────────────────────────────┘  
                                    │  (JSON Action Response)  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│             외부 도구 실행 실행기 및 크롤러 시스템                      │  
│  \- JSON 수신 분석 후 fan\_out\_search 또는 verify 로컬/원격 도구 직접 가동   │  
└────────────────────────────────────────────────────────────────────────┘

### **DeepSeek R1 계열 '추론 생각 단계(Thinking Chain)' 제어 아키텍처 설계**

DeepSeek R1 및 R1 Distill 모델은 고도로 다듬어진 추론 생각 단계를 \<think\>...\</think\> 토큰 구조 내에 자율 방출한다28. 이 모델군을 하네스 시스템에 정책 LLM으로 접목하는 경우, 다음과 같은 **추론 듀얼모드 필터링**을 적용해야 전체 RAG 에이전트의 안정성을 해치지 않는다50.

1. **JSON 정규화 바인딩과 생각 분리**: R1 모델의 생각 영역(\<think\> 내부)에 나타나는 자가 반성 및 추론 로그는 매우 유용하다49. 그러나 이를 최종 액션 파서에 그대로 노출시키면 파싱 실패 오버헤드가 발생한다50. 따라서 호스트 하네스 단에서 정규 표현식으로 생성 토큰 스트림을 가로챈 뒤, 생각 영역은 내부 추론 디버깅용(internal\_thought)으로 따로 기록 보존하고, \<think\> 블록이 닫힌 뒤에 나오는 순수 JSON 문자열만 파싱 대상 노드로 분리 포워딩한다50.  
2. **생각 기능 강제 스위칭 제어**: 단순 문서 스캔이나 DB 저장물 매핑 같은 단순 루틴성 작업 노드(예: grep\_corpus 등)에서는 \<think\> 출력을 비활성화하는 옵션(--chat-template-kwargs '{"enable\_thinking":false}')을 적용해 토큰 소모 속도 지연을 원천 방지한다9. 복잡한 다중 문서 크로스-참조 검증 작업 노드(verify 단계)에서만 생각 단계를 전면 개방하여 추론의 고정밀 가치를 극대화한다51.

#### **하네스 상태 기록 전용 Pydantic 제어 모델 구조 선언**

에이전트가 탐색하는 모든 의미 궤적을 객체지향형 메모리 영역에 격리 관리하기 위하여, Python 백엔드 단에서 다음과 같은 영속적 제어 구조를 선언 운용한다7.

Python  
from typing import Dict, List, Literal, Optional  
from pydantic import BaseModel, Field

class CuratedEvidence(BaseModel):  
    doc\_id: str  
    original\_title: str  
    importance\_tag: Literal\["very\_high", "high", "fair", "low"\]  
    compressed\_chunks: List\[str\] \= Field(default\_factory=list) \# 문장 수준 BM25 기반 필터링 4개 문장 전용 적재

class VerificationRecord(BaseModel):  
    claim\_statement: str  
    status: Literal\["unverified", "verified", "contradicted"\] \= "unverified"  
    assigned\_evidence\_ids: List\[str\] \= Field(default\_factory=list)

class ExternalizedStateStore(BaseModel):  
    primary\_query: str  
    total\_allowed\_turns: int \= 15  
    remaining\_turns: int \= 15  
    candidate\_pool: Dict\[str, str\] \= Field(default\_factory=dict) \# doc\_id \-\> raw content mapping  
    curated\_evidence\_ledger: Dict\[str, CuratedEvidence\] \= Field(default\_factory=dict)  
    verification\_registry: Dict\[str, VerificationRecord\] \= Field(default\_factory=dict)

#### **동적 인프라 렌더러 구현 패턴**

하네스 프레임워크는 수립된 ExternalizedStateStore 메모리 스토어 인스턴스를 즉각 파싱하여, 아래의 표준 마크다운 프롬프트 인터페이스 스냅샷으로 정밀 치환함으로써 신경망의 추가적인 인지 과부하를 원천 배제한다41.

# **시스템 인지 대시보드 및 지시 지침**

\[현재 남은 에피소드 가용 단계: 11턴\]  
당신은 검색 정책 오케스트레이터입니다. 아래의 영속 외재 상태 테이블을 면밀히 참조하여, 중복된 정보를 재검색하지 말고 오직 검증되지 않은 가설을 파기하거나 가치 있는 문서만을 승격 및 인출하십시오.

## **검증 대상 명제 가부 현황판**

* 명제 ID: CLAIM-034  
  * 내용: "피투자 법인의 특허 포트폴리오 중 자율주행 회로 차단 시스템 설계 도면 존재 여부"  
  * 상태: \[미검증 (unverified)\] \-\> CLAIM-034에 대응하는 원격 코퍼스 탐지 필요.

## **수집된 큐레이션 및 증거 문서 테이블**

| 문서 ID | 소스 문서 타이틀 | 가중치 등급 | 추출된 문장 중요 요약 (BM25 Compressed) |
| :---- | :---- | :---- | :---- |
| PATENT-A4 | US\_9921024\_B2 | very\_high | "본 발명은 자율주행 차량의 배터리 과전류를 완화하기 위한 이중 전원 회로 차단 수단을 규정한다." |
| SEC-FILE-02 | Annual\_Filing\_2025 | fair | "2024년 4분기 기준 하드웨어 설계 부서 조직 개편이 완수되었음을 보고합니다." |

반드시 다음 JSON 양식만을 생성하여 즉각 호출하십시오. 임의의 부연 설명이나 공백을 완전 금지합니다:  
{"thought": "생각 및 이유", "action": "grep\_corpus", "arguments": {"query": "circuit block diagram"}}

## **5\. 결론 및 아키텍트 제언**

### **에이전트 빌드업을 위한 핵심 오픈소스 결합 추천**

제한된 사용자 로컬 사양에서 가장 빠르고 견고하게 '상태 외재화 에이전트' 파이프라인을 빌드하기 위해서는 다음과 같은 프레임워크 및 컴포넌트 조합이 가장 이상적이다15.

┌────────────────────────────────────────────────────────────────────────┐  
│                        통합 기술 아키텍처 스택                         │  
├───────────────────────────┬────────────────────────────────────────────┤  
│ 상태 전이 제어 코어       │ LangGraph (스레드 안전 영속 체크포인팅 내장)  │  
├───────────────────────────┼────────────────────────────────────────────┤  
│ 로컬 메모리 인덱서        │ Chroma DB (인메모리 프로세스 최적 결합)    │  
├───────────────────────────┬────────────────────────────────────────────┤  
│ 로컬 추론 및 구문 제한    │ llama.cpp (Context Shifting 및 MTP 지원)   │  
└───────────────────────────┴────────────────────────────────────────────┘

#### **LangGraph의 적합성 및 차별성**

LangGraph는 단순한 에이전트 루프 작성을 넘어, 에이전트 세션의 이전 시점 상태를 안전하게 롤백(Rollback)하거나 특정 노드의 의사결정이 모순을 겪었을 시 해당 분기 전 시점의 영속 가중 스냅샷으로 가상 런타임을 회귀시키는 '런타임 타임 트래블(Time Travel)' 체크포인팅 시스템을 내장하고 있어 상태 제어 프레임워크로 독점적인 우위를 점한다6.

#### **Chroma DB의 적합성 및 차별성**

Chroma DB는 Harness-1의 메인 엔지니어링 개발 파트너사로 참여한 검증된 벡터 저장 플랫폼이며3, 파이썬의 로컬 메모리 내부 가동이 완벽하게 보장되어 임베딩 검색 가속 집행 시 원격 네트워크 전송 오버헤드를 제로화한다55.

#### **llama.cpp의 적합성 및 차별성**

컨텍스트 시프팅 및 MTP(Multi-Token Prediction) 가속을 지원하므로, LangGraph 루프가 돌면서 고정 상태 마크다운 표 프롬프트를 최신 모델에 전송할 때 매번 첫 문장부터 토큰을 다시 계산하는 낭비를 완벽히 억제하여 로컬 가동 시의 대기 지연을 극적으로 차단한다48.

### **단계별 개발 실행 이행 로드맵 (Roadmap)**

\[Phase 1\] ─────────────► \[Phase 2\] ─────────────► \[Phase 3\] ─────────────► \[Phase 4\]  
엔진 빌드 및             하네스 상태 제어          LangGraph 상태           사용자 시나리오 다듬기  
모델 튜닝 테스트          및 압축 파이프라인        기계 통합 및             및 SFT 전이 학습 집행  
                         통합 설계                 도구 바인딩

#### **Phase 1: 로컬 추론 최적 가속화 기틀 마련**

* 가동 장비가 RAM 16GB, GPU VRAM 8GB급 메인스트림급 사양이라 판정되는 경우, 2026년 최신 추론 성능이 극대화된 **Gemma 4 12B IT**를 최신 QAT Q4\_0 포맷으로 확보한다23.  
* VRAM 점유량 축소 및 MTP 가속 적용을 위해 llama.cpp 백엔드를 탑재하고 로컬 GPU 오프로딩 레이어 분배를 완료한다48.

#### **Phase 2: 외재 상태 제어 및 지식 처리 기하 알고리즘 조립**

* 하네스가 실행할 'MinHash-LSH' 및 문장 수준의 'Sentence-BM25' 가중치 선별 모듈을 로컬 파이썬 메모리 가속 패키지로 컴파일 구축한다6.  
* 첫 성과 검색물 발견 시 상위 8개 고신뢰 후보 문서를 즉각 투입하는 자동 시딩 알고리즘을 하네스 스토어 라이프사이클에 직접 코딩 구현한다6.

#### **Phase 3: LangGraph 상태 기계 통합 및 도구 바인딩**

* fan\_out\_search, grep\_corpus, verify 등 로컬 수색을 완수할 핵심 도구 세트를 LangGraph 노드 함수로 개별 배정 설계한다6.  
* 정책 모델이 방출한 액션 JSON 형식을 JSON Schema 제약 커널을 활용하여 실시간 오차 없이 수용하며, 실패 시 하네스가 자동으로 프롬프트와 DeepSeek R1 정규화 가로채기를 통해 형태를 재교정하는 안전 장치를 결합한다42.

#### **Phase 4: 사용자 시나리오 다듬기 및 SFT 전이 학습 집행**

* 실제 사무 업무 및 문서 수색 영역에 해당 에이전트를 실 배치하여, 9B/12B 수준의 경량 최신 모델이 간헐적으로 상태 대시보드의 테이블 형식을 준수하지 못하고 이탈하는 사례를 정량 수집한다13.  
* 취합된 궤적(Trajectory) 데이터를 바탕으로 로컬 SFT 정밀 파인튜닝(LoRA rank 32 기반)을 전개함으로써, 최종적인 로컬 자율 검색 정확도를 Harness-1의 전이 학습 역량과 동등하게 도달할 수 있도록 상향 조율한다6.

#### **참고 자료**

1. The Local AI Revolution: Qwen Coder for Private, Cost-Effective Development, [https://atalupadhyay.wordpress.com/2026/03/30/the-local-ai-revolution-qwen-coder-for-private-cost-effective-development/](https://atalupadhyay.wordpress.com/2026/03/30/the-local-ai-revolution-qwen-coder-for-private-cost-effective-development/)  
2. How much does VRAM matter? : r/LocalLLaMA \- Reddit, [https://www.reddit.com/r/LocalLLaMA/comments/196plc8/how\_much\_does\_vram\_matter/](https://www.reddit.com/r/LocalLLaMA/comments/196plc8/how_much_does_vram_matter/)  
3. Researchers trained an open source AI search agent, Harness-1, that outperforms GPT-5.4 on recalling relevant information | VentureBeat, [https://venturebeat.com/orchestration/researchers-trained-an-open-source-ai-search-agent-harness-1-that-outperforms-gpt-5-4-on-recalling-relevant-information](https://venturebeat.com/orchestration/researchers-trained-an-open-source-ai-search-agent-harness-1-that-outperforms-gpt-5-4-on-recalling-relevant-information)  
4. pat-jj/harness-1 \- Hugging Face, [https://huggingface.co/pat-jj/harness-1](https://huggingface.co/pat-jj/harness-1)  
5. \[2606.02373\] Harness-1: Reinforcement Learning for Search Agents with State-Externalizing Harnesses \- arXiv, [https://arxiv.org/abs/2606.02373](https://arxiv.org/abs/2606.02373)  
6. Meet Harness-1: A 20B Retrieval Subagent Trained With Reinforcement Learning Inside a Stateful Search Harness on gpt-oss-20b \- MarkTechPost, [https://www.marktechpost.com/2026/06/06/meet-harness-1-a-20b-retrieval-subagent-trained-with-reinforcement-learning-inside-a-stateful-search-harness-on-gpt-oss-20b/](https://www.marktechpost.com/2026/06/06/meet-harness-1-a-20b-retrieval-subagent-trained-with-reinforcement-learning-inside-a-stateful-search-harness-on-gpt-oss-20b/)  
7. Paper page \- Harness-1: Reinforcement Learning for Search Agents with State-Externalizing Harnesses \- Hugging Face, [https://huggingface.co/papers/2606.02373](https://huggingface.co/papers/2606.02373)  
8. I ran Gemma 4 and Qwen 3.5 for the same local tasks, and one pulled miles ahead, [https://www.xda-developers.com/ran-gemma-4-and-qwen-35-for-same-local-tasks-one-pulled-ahead/](https://www.xda-developers.com/ran-gemma-4-and-qwen-35-for-same-local-tasks-one-pulled-ahead/)  
9. Gemma 4 \- How to Run Locally | Unsloth Documentation, [https://unsloth.ai/docs/models/gemma-4](https://unsloth.ai/docs/models/gemma-4)  
10. Best Local LLMs May 2026: Ollama, LM Studio, Hardware & VRAM Guide \- PromptQuorum, [https://www.promptquorum.com/local-llms](https://www.promptquorum.com/local-llms)  
11. Best Open Source LLMs in 2026: We Reviewed 7 Models \- Fireworks AI, [https://fireworks.ai/blog/best-open-source-llms](https://fireworks.ai/blog/best-open-source-llms)  
12. deepseek-r1:8b \- Ollama, [https://ollama.com/library/deepseek-r1:8b](https://ollama.com/library/deepseek-r1:8b)  
13. gpt-oss-20b Model by OpenAI \- Nvidia NIM, [https://build.nvidia.com/openai/gpt-oss-20b/modelcard](https://build.nvidia.com/openai/gpt-oss-20b/modelcard)  
14. MiniMax-M1: Scaling Test-Time Compute Efficiently with Lightning Attention \- arXiv, [https://arxiv.org/html/2506.13585v1](https://arxiv.org/html/2506.13585v1)  
15. Natural-Language Agent Harnesses \- arXiv, [https://arxiv.org/html/2603.25723v1](https://arxiv.org/html/2603.25723v1)  
16. The Best Open-Source LLMs in 2026 \- BentoML, [https://www.bentoml.com/blog/navigating-the-world-of-open-source-large-language-models](https://www.bentoml.com/blog/navigating-the-world-of-open-source-large-language-models)  
17. Best PCs for Local AI 2026: 21 Tested Builds, £200 to £8K \- Houtini, [https://houtini.com/articles/best-pcs-for-local-ai-tested-specs-for-running-llms-without-the-cloud/](https://houtini.com/articles/best-pcs-for-local-ai-tested-specs-for-running-llms-without-the-cloud/)  
18. Gemma 4 12B: Benchmarks, VRAM & How to Run It | TECHSY, [https://techsy.io/en/blog/gemma-4-12b](https://techsy.io/en/blog/gemma-4-12b)  
19. Best Open Source LLMs in 2026: Rankings and Licensing Comparison | Onyx AI, [https://onyx.app/insights/best-open-source-llms-2026](https://onyx.app/insights/best-open-source-llms-2026)  
20. NVIDIA GeForce RTX 4070 SUPER | AI Hardware Directory \- Made By Agents, [https://www.madebyagents.com/hardware/nvidia-geforce-rtx-4070-super](https://www.madebyagents.com/hardware/nvidia-geforce-rtx-4070-super)  
21. deepseek-ai/DeepSeek-R1-Distill-Qwen-7B \- Hugging Face, [https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B](https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-7B)  
22. Daily Papers \- Hugging Face, [https://huggingface.co/papers?q=harness%20self-evolution](https://huggingface.co/papers?q=harness+self-evolution)  
23. Why Smaller AI Outperforms Giants: The Harness-1 Paradigm Shift \- Techbuddies Studio, [https://www.techbuddies.io/2026/06/10/why-smaller-ai-outperforms-giants-the-harness-1-paradigm-shift/](https://www.techbuddies.io/2026/06/10/why-smaller-ai-outperforms-giants-the-harness-1-paradigm-shift/)  
24. Experimentation with Qwen 3.6 and Gemma 4 \- Guidance needed : r/LocalLLaMA \- Reddit, [https://www.reddit.com/r/LocalLLaMA/comments/1tyjc8z/experimentation\_with\_qwen\_36\_and\_gemma\_4\_guidance/](https://www.reddit.com/r/LocalLLaMA/comments/1tyjc8z/experimentation_with_qwen_36_and_gemma_4_guidance/)  
25. Deepseek-R1-Distill-Llama-8B \- NGC Catalog \- NVIDIA, [https://catalog.ngc.nvidia.com/orgs/nim/teams/deepseek-ai/containers/deepseek-r1-distill-llama-8b](https://catalog.ngc.nvidia.com/orgs/nim/teams/deepseek-ai/containers/deepseek-r1-distill-llama-8b)  
26. Ultimate Guide \- The Best Open Source LLM For Korean In 2026 \- SiliconFlow, [https://www.siliconflow.com/articles/en/best-open-source-llm-for-korean](https://www.siliconflow.com/articles/en/best-open-source-llm-for-korean)  
27. Which is the best local VLM? Benchmark results June 2026 : r/LocalLLM \- Reddit, [https://www.reddit.com/r/LocalLLM/comments/1u5p459/which\_is\_the\_best\_local\_vlm\_benchmark\_results/](https://www.reddit.com/r/LocalLLM/comments/1u5p459/which_is_the_best_local_vlm_benchmark_results/)  
28. DeepSeek-R1 8B: Specifications and GPU VRAM Requirements \- ApX Machine Learning, [https://apxml.com/models/deepseek-r1-8b](https://apxml.com/models/deepseek-r1-8b)  
29. Harness-1: Reinforcement Learning for Search Agents with State, [https://hyper.ai/en/papers/2606.02373](https://hyper.ai/en/papers/2606.02373)  
30. Run DeepSeek R1 locally on your device (Beginner-Friendly Guide) \- Jan.ai, [https://www.jan.ai/post/deepseek-r1-locally](https://www.jan.ai/post/deepseek-r1-locally)  
31. Top 5 Local LLM Tools and Models in 2026 \- Pinggy, [https://pinggy.io/blog/top\_5\_local\_llm\_tools\_and\_models/](https://pinggy.io/blog/top_5_local_llm_tools_and_models/)  
32. Daily Papers \- Hugging Face, [https://huggingface.co/papers?q=externalization](https://huggingface.co/papers?q=externalization)  
33. RTX 3090 vs RTX 3060: inference comparison : r/LocalLLaMA \- Reddit, [https://www.reddit.com/r/LocalLLaMA/comments/1augktf/rtx\_3090\_vs\_rtx\_3060\_inference\_comparison/](https://www.reddit.com/r/LocalLLaMA/comments/1augktf/rtx_3090_vs_rtx_3060_inference_comparison/)  
34. llama4:scout/template \- Ollama, [https://ollama.com/library/llama4:scout/blobs/161e5d878840](https://ollama.com/library/llama4:scout/blobs/161e5d878840)  
35. The Llama 4 herd: The beginning of a new era of natively multimodal AI innovation \- Meta AI, [https://ai.meta.com/blog/llama-4-multimodal-intelligence/](https://ai.meta.com/blog/llama-4-multimodal-intelligence/)  
36. Best Open-Source LLM 2026: 8 Tested, 3 Beat GPT-4 | TECHSY, [https://techsy.io/en/blog/best-open-source-llms-2026](https://techsy.io/en/blog/best-open-source-llms-2026)  
37. 120 tok/s on 12GB VRAM with Gemma 4 12B QAT MTP, [https://www.reddit.com/r/LocalLLaMA/comments/1typjmc/120\_toks\_on\_12gb\_vram\_with\_gemma\_4\_12b\_qat\_mtp/](https://www.reddit.com/r/LocalLLaMA/comments/1typjmc/120_toks_on_12gb_vram_with_gemma_4_12b_qat_mtp/)  
38. \[astro-ph/0602373\] Galaxy cluster mass profiles \- arXiv, [https://arxiv.org/abs/astro-ph/0602373](https://arxiv.org/abs/astro-ph/0602373)  
39. gpt-oss-20b \- AI Model Catalog | Microsoft Foundry Models, [https://ai.azure.com/catalog/models/gpt-oss-20b](https://ai.azure.com/catalog/models/gpt-oss-20b)  
40. Introducing gpt-oss \- OpenAI, [https://openai.com/index/introducing-gpt-oss/](https://openai.com/index/introducing-gpt-oss/)  
41. \[Literature Review\] Harness-1: Reinforcement Learning for Search Agents with State-Externalizing Harnesses \- Moonlight, [https://www.themoonlight.io/en/review/harness-1-reinforcement-learning-for-search-agents-with-state-externalizing-harnesses](https://www.themoonlight.io/en/review/harness-1-reinforcement-learning-for-search-agents-with-state-externalizing-harnesses)  
42. Trends in Context & Harness Engineering for AI ... \- Scouts by Yutori, [https://scouts.yutori.com/bb544d39-ecfb-46ca-9d2e-879ea2a63c39](https://scouts.yutori.com/bb544d39-ecfb-46ca-9d2e-879ea2a63c39)  
43. Clipped Importance Sampling Policy Optimization (CISPO) \- Swift DOCUMENTATION, [https://swift.readthedocs.io/en/latest/Instruction/GRPO/AdvancedResearch/CISPO.html](https://swift.readthedocs.io/en/latest/Instruction/GRPO/AdvancedResearch/CISPO.html)  
44. Hardware Requirements for Running GPT-OSS-20B Locally \- IntuitionLabs, [https://intuitionlabs.ai/articles/hardware-requirements-gpt-oss-20b](https://intuitionlabs.ai/articles/hardware-requirements-gpt-oss-20b)  
45. bartowski/openai\_gpt-oss-20b-GGUF \- Hugging Face, [https://huggingface.co/bartowski/openai\_gpt-oss-20b-GGUF](https://huggingface.co/bartowski/openai_gpt-oss-20b-GGUF)  
46. gpt-oss-20b \- llama.app, [https://llama.app/models/gpt-oss-20b](https://llama.app/models/gpt-oss-20b)  
47. VRAM Requirements for Local LLMs: The Complete Guide (2026) \- LLM Configurator, [https://llmconfigurator.com/en/guides/vram-requirements-guide](https://llmconfigurator.com/en/guides/vram-requirements-guide)  
48. msb-msb/awesome-local-ai: A curated list of resources for running AI locally on consumer hardware \- GitHub, [https://github.com/msb-msb/awesome-local-ai](https://github.com/msb-msb/awesome-local-ai)  
49. Run DeepSeek R1 Locally with Ollama (2026): Setup \+ VRAM Guide, [https://localaimaster.com/blog/deepseek-r1-local-setup-guide](https://localaimaster.com/blog/deepseek-r1-local-setup-guide)  
50. Local LLMs in Real Work: Gemma 4, Qwen 3.6, and Qwen Coder | by Tort Mario \- Medium, [https://medium.com/@tort\_mario/local-llms-in-real-work-gemma-4-qwen-3-6-and-qwen-coder-d43811c7e9b2](https://medium.com/@tort_mario/local-llms-in-real-work-gemma-4-qwen-3-6-and-qwen-coder-d43811c7e9b2)  
51. The Complete Guide to DeepSeek Models: V3, R1, V4 and Beyond \- BentoML, [https://www.bentoml.com/blog/the-complete-guide-to-deepseek-models-from-v3-to-r1-and-beyond](https://www.bentoml.com/blog/the-complete-guide-to-deepseek-models-from-v3-to-r1-and-beyond)  
52. DeepSeek Models: V3.2, R1, Distills, and Production Caveats \- Fireworks AI, [https://fireworks.ai/blog/deepseek-models](https://fireworks.ai/blog/deepseek-models)  
53. pat-jj/harness-1: Ultra Recipe for Training Long-Horizon Search Agents \- matching frontier AI's search capability with a 20B model \- GitHub, [https://github.com/pat-jj/harness-1](https://github.com/pat-jj/harness-1)  
54. Researchers trained an open source AI search agent, Harness-1, that outperforms GPT-5.4 on recalling relevant information : r/BayAreaHomes \- Reddit, [https://www.reddit.com/r/BayAreaHomes/comments/1u0p6nt/researchers\_trained\_an\_open\_source\_ai\_search/](https://www.reddit.com/r/BayAreaHomes/comments/1u0p6nt/researchers_trained_an_open_source_ai_search/)  
55. harness-1/docs/run\_vllm\_browsecompplus.md at main \- GitHub, [https://github.com/pat-jj/harness-1/blob/main/docs/run\_vllm\_browsecompplus.md](https://github.com/pat-jj/harness-1/blob/main/docs/run_vllm_browsecompplus.md)

[image1]: <data:image/png;base64,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>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAaCAYAAACzdqxAAAABUUlEQVR4Xt2UvUpDQRBGR4ggGhH8jSIiYicWYimCRQqbNKl9ALERsVBsTGOnpb6BhailnUVAQbCyEW0sbHwDBQvR72M2ydzRxt0LSg4ckp25TDazs1fkD+mAa3DTJ1JgsTs4DUtwH3ZmnohkQ7Rgg3U4ZNb/m1kfyAP2+MUHU1mE7/ATFl0uGha6gGeihUez6XhW4AlcgG+SY+ErOAfn4Wv4TIZFhsN37vQZVlrpOHi7js26V3T3VROLggXOzZqHWIdbJvZrBuCt6BR4d8xzDZbgPRxx8Qwz8BpOujjZEx27gol1iY5jzcS+wb5ytFZ9IsA21KV1SbpF/9kHfICncCzkmvCdeyR6w5bD2sKdbcNHOGHiZfgEx02sSQ+8lGwvayZ/4HKUPR0UbQ9bwR/OFRb96UCT4aWZEn378Qx8C6O5gbvwEPa5XBKcpH7JcadtyBdhMzlOknDoRwAAAABJRU5ErkJggg==>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACoAAAAaCAYAAADBuc72AAACfElEQVR4Xu2WTYiNURjHHxlFCCmTmJSURFlYsZixYKGYxVhQ7FFWNrK0sJcNSclimpKNkI8spljMsFLKhnwkFpIoK/n4/zrn3Dnvc8/73rnN3Nm4v/p3733ec8/7nOfjnGPWp8//xVJphTd2YJU3LAQPpU3emDFoYTE5t6UxZ+spOLjfGyOLpCPSHemjVR3jfy+kw5mtZ+DgJ2+M8OyXdDL+3iX9lI61RoT0T0kXM9u8s0x6IE34B2Kd9FJ6Jq2NtuTohTQoctpCtHvGDumbVSOU4OV/pbOZ7VC03chskObpyGr3e7bde0L6Ie30D8QrC9EjiokzFhy9lNlgjfRcGnD2FtTHLQurZoIv0h7puzRpzQ7zbDKqNI753kpXo65bmP+PtC8bl6Actnljgj8wCStk4lT0fKfualdoYbt5I41b6OyclRbmeGQzjtL1OPlZ2jwztAXByqNf4YA0LD2x6gQj0vI0qIb10ntrrzfYKH21aoQoE5wng6UA4Ggp0hWY9J61b8g519zvJkeJDDVH7SVwEEePZrYcHKXZGmEColsHkdntbKkBHlt79HHUL4B3HHe2nMbUA41QVzdbpbvSa2laOi8tjs+IPlmgbKjJHOo3d3TIQp0uyWweMkaWasHBTmmn2XzDAHY2amoyh7EcBBwICCeaLiBp0T4zFfZadVP2pBSXGJV+W7kJOMPvx8+b7plng/TOGz2kMqWzBPXJNlQivcAfiUCaKQF/mJRgoRwcc4L00rHcgEqR22JzO6e3Sx+s/vY1a0jvU+mUlesU6GYuId1C1DmxLlt5b+2a0hGZwwuvxM9u4B5KEzU12rxzTjrojR3gDrqgTvaBf4aicUV5Wp/kAAAAAElFTkSuQmCC>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGkAAAAaCAYAAAC0NHJVAAAE6ElEQVR4Xu2ZW8htUxTH/0IRB3Hcos454kGIIie3B0W5P+BBKS+So7w4bpGH7yTFi1xfRKIkl6IQIbYUwgMPIpc6JPKAUpS78Wus8e25x1lr7b32Xh/trF/9+/aac6255pzjMsfqkwYGBgYGBgbWgj0r9cUepl1z45z0Nc5Sc4LpDdOG3LEAj5jOz41zsrfpatNOuWMWzjB9ZfrNdGPqWyY+NW3OjQvSp5HgbdO1mtNQ8LeW10hbTJtyYw/0baRdTI+bRpozLS+rkQ40fawFvLOFvo0EZ8mzFn87s6xGusD0Z27sibUw0nrTR/KI6kyTkfDQ/UwHmHZOfSV4dIQwz1ysfg/xOnjPw6avc0cNzL1t/nVMM9I+8nV3qdyY82Om7al9JrKROOAIy4uKNn7TRh9glJdN31TXTPZJ04+mq0zbqrYSqpwX5cUKzxEF/GXcH6p2tH880MJhpm/lm1nHcfKxnpW/90T53PJam2gy0pnycYD13W76ZNw9FcZkDp3JE//Z9JJp96KN37TFBKkM/zK9unqHj9E0AbzoTtP91TXPP2PazfSK6fiqvY46j+V+5nlbag84q3CAw6tr5o+DMGfePY06I3H4Py2v1OAY+X58uHrHdGLfOpONxPXNxXXAxMMIl1S/mXTQZiQ26WT5ZmOw+zR+57umg6vfJdx3mek606OadJowUl1U8BzzuKdow9BfyFPNIUV7E3VGInuM5GOz2evkx0GXai3m3ZnSSHxpZ6MFGI4+vP9ouRe9V9M/DTbsfdOp1fV21RuJFEtKZTOIgpOKPn7/qvp5btKOEcO7fpc7FRERsBYiOlNnJIx/q3yNoTs0GeVN4wW9GCmuHyyugzKSyPPPm84xvWB6yHSuZjug35Ef+iwaOFs4Y0r4QidlYdBD5QVCuWmx2Lp5ch9zYsMCjIORMBaeH1GJIYmwTDbSQfLUeql83qzzFu24d03jBb2dSXjoSJNhjFHYXPoAzycaiKiu4OUstrwuvT7eFYZkYzFIeQ/v/1KT6TbgPja5hPOJzcPojHe6fI04yC+mK1bvdLKRcAb2iTOYbAMXajz3U9Q+XsC6OxuJUOWhFY2j4AZ55XW5fJMQv//QuLqLjaQyI4oeqLStur8JPPh705FFG+/njIrnjjX9pHHFxztytLFRbFiZbgM+GUYaO9lG+Tto20tewACRRsQ1nb/ZSB/I5wb7ml6TrznSXdt4AdHI+mcmQq8UbWwW58Hnpu8q8fvsqg8w6PXVM1lPyY1YBxVRVHUB0Vm2MQciJyo+Fp7TF6yoecGfmd6Uz4XNxXlId69rfGZgdKKxrtrLRtogzxyU2zglTnSXxlEFbeNBFB5Uyb3CRxsqwVArck+Pwz/aN8pTANVfHdyTNxuvLA/frRqnJiBV1Y0XxUMdOBERVX6Is47yOs4PzrxMNlLAGKTa/EkAbeMB2QOn4rxdc0hZz8lLZ0rQDDl5S27sAJtPNbdO7sF8iDZxmvwDsyuRmkg/OM5Rk92NRmpi2ng4B99TcVz8K+Atb8nTIL/xriPk+T6XpV3h2Xvl5e601MCGjNScXttgw0h9d+cOdTcStI13k/wMnWeeC0Ha2Cx/OWH+hOnKiTvmh83PabCJKFpmuTdD+srpF+YxEjSNR4FDVvjfgnHw1PNyxwJco/7+kUhBwXfWwMDAf8I/bFkgI6j0F88AAAAASUVORK5CYII=>