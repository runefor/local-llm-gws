from googleapiclient.discovery import build
from .auth import get_credentials

# Gmail API Quota 참고:
# 1. users.messages.list (목록 가져오기)는 한 번에 최대 500개(maxResults=500)까지 페이징(pageToken)하여 가져올 수 있습니다.
# 2. 할당량 비용: 목록(list) 조회 1점, 개별 메시지(get) 조회 5점.
# 3. 일일 할당량: 1,000,000,000점으로 매우 넉넉하지만, 한 번에 수만 통의 get 요청을 보내면 초당 할당량 제한(Rate Limit)에 걸릴 수 있습니다.
# 결론: 목록을 들고 오는 것(list)은 한계가 없지만, 내용을 모두 가져오는 것(get)은 트래픽 조절이 필요합니다.

def list_messages(max_results=500, page_token=None):
    """
    Gmail 목록을 가져옵니다. 페이징을 지원합니다.
    """
    creds = get_credentials()
    service = build('gmail', 'v1', credentials=creds)
    
    # query를 사용하여 특정 날짜 이후나 조건부 검색이 가능합니다 (예: "newer_than:1d")
    results = service.users().messages().list(
        userId='me', 
        maxResults=max_results,
        pageToken=page_token
    ).execute()
    
    messages = results.get('messages', [])
    next_page_token = results.get('nextPageToken', None)
    
    return messages, next_page_token

def get_message(msg_id):
    """
    특정 메시지의 상세 내용을 가져옵니다.
    """
    creds = get_credentials()
    service = build('gmail', 'v1', credentials=creds)
    
    message = service.users().messages().get(
        userId='me', 
        id=msg_id,
        format='full'  # 본문을 가져오기 위해 full 포맷 사용
    ).execute()
    
    return message
