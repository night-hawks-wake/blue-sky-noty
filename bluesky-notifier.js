import fetch from 'node-fetch'

const {
    BLUESKY_USERNAME,
    BLUESKY_APP_PASSWORD,
    DISCORD_WEBHOOK_URL,
    NOTIFY_INTERVAL_MIN = 1
} = process.env;

/** env check */ 
if (!BLUESKY_USERNAME || !BLUESKY_APP_PASSWORD || !DISCORD_WEBHOOK_URL) {
  console.error('❌ 환경변수를 모두 입력해야 합니다.');
  process.exit(1);
}

let lastSeen = null;

/** Get Bluesky Session Token */
async function getAccessToken() {
  try {
    const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: BLUESKY_USERNAME,
        password: BLUESKY_APP_PASSWORD
      })
    });
    if (!res.ok) throw new Error('Bluesky 로그인 실패');
    const { accessJwt } = await res.json();
    return accessJwt;
  } catch (err) {
    console.error('❌ Bluesky 인증 오류:', err);
    throw err;
  }
}

/** Bring the newest notification */
async function getBlueskyNotifications(token) {
  const res = await fetch('https://bsky.social/xrpc/app.bsky.notification.listNotifications', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Bluesky 알림 요청 실패');
  const { notifications } = await res.json();
  return notifications;
}

/** 디스코드에 메시지 전송 */
async function sendDiscord(content) {
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  if (!res.ok) {
    const errTxt = await res.text();
    console.error('❌ Discord 전송 실패:', errTxt);
  }
}

/** Message formatting */
function buildMessage(notif) {
  const text = notif.record?.text || '(내용 없음)';
  const author = notif.author?.handle || '익명';
  const url = notif.uri ? `https://bsky.app/profile/${author}/post/${notif.uri.split('/').pop()}` : '';
  return `🔔 **${notif.reason}** by \`${author}\`\n${url ? `<${url}>` : ''}\n> ${text}`;
}


/** 메인 감시 함수 */
async function checkAndNotify() {
  try {
    const token = await getAccessToken();
    const notifs = await getBlueskyNotifications(token);

    // 새 알림만 필터링 (중복 전송 방지)
    const newNotifs = [];
    for (const notif of notifs) {
      if (notif.uri === lastSeen) break;
      newNotifs.push(notif);
    }
    if (newNotifs.length > 0) {
      lastSeen = newNotifs[0].uri;
      for (const notif of newNotifs.reverse()) {
        await sendDiscord(buildMessage(notif));
      }
      console.info(`✅ ${newNotifs.length}건의 새 알림을 전송했습니다.`);
    } else {
      console.info('새로운 알림 없음.');
    }
  } catch (err) {
    console.error('❌ 전체 프로세스 에러:', err);
  }
}



// 타이머 설정 및 즉시 실행
const intervalMs = Number(NOTIFY_INTERVAL_MIN) * 60 * 1000;
console.info(`Bluesky-Discord 알림 봇 시작 (주기: ${NOTIFY_INTERVAL_MIN}분)`);
checkAndNotify();
setInterval(checkAndNotify, intervalMs);
