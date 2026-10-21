// ─────────────────────────────────────────────
// 과거 날짜 하루 요약 문서 채우기 (daily-summary.js 참고)
//   최근 BACKFILL_DAYS개 날짜 × 부품 카테고리 중 요약 문서가 없는 것만
//   기존 상품 문서를 읽어 요약 문서를 만든다.
//   상품 문서를 읽는 만큼 Firestore 읽기를 쓰므로 실행 1회당 MAX_READS까지만 쓰고 멈춘다.
//   (남은 날짜는 다음 실행에서 이어서 채운다. 다 채운 뒤에는 확인용 읽기 ~150건만 쓴다)
// ─────────────────────────────────────────────
const admin = require('firebase-admin');
const { summaryRef, toSummaryItem, buildSummary } = require('./daily-summary');

const PRODUCT_LIST_BRANDS = ['그래픽카드', '메인보드', 'CPU', 'Microsoft'];
const BACKFILL_DAYS = Number(process.env.BACKFILL_DAYS) || 30;
const MAX_READS = Number(process.env.MAX_READS) || 15000;

let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
} else {
  credential = admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  });
}
if (!admin.apps.length) admin.initializeApp({ credential });
const db = admin.firestore();

async function main() {
  let reads = 0;

  // 대시보드와 같은 기준: 최신 날짜 문서 BACKFILL_DAYS개
  const datesSnap = await db.collection('compuzone_prices')
    .orderBy(admin.firestore.FieldPath.documentId(), 'desc')
    .limit(BACKFILL_DAYS)
    .get();
  reads += Math.max(datesSnap.size, 1);
  const dateDocs = datesSnap.docs.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.id));
  console.log(`📅 대상 날짜 ${dateDocs.length}개 (${dateDocs.at(-1)?.id} ~ ${dateDocs[0]?.id}), 읽기 한도 ${MAX_READS}`);

  let created = 0;
  let pending = 0;

  for (const dateDoc of dateDocs) {
    const date = dateDoc.id;
    const master = dateDoc.data();

    const refs = PRODUCT_LIST_BRANDS.map((b) => summaryRef(db, b, date));
    const existing = await db.getAll(...refs);
    reads += refs.length;

    for (let i = 0; i < PRODUCT_LIST_BRANDS.length; i++) {
      const brandId = PRODUCT_LIST_BRANDS[i];
      if (existing[i].exists) continue;

      // 읽기 전에 크기를 가늠: 날짜 문서의 {브랜드}_count, 없으면 count() 집계(1건)
      let expected = Number(master[`${brandId}_count`] || 0);
      if (!expected) {
        const agg = await dateDoc.ref.collection(brandId).count().get();
        reads += 1;
        expected = agg.data().count;
      }
      if (expected === 0) continue; // 그날 수집 안 된 브랜드

      if (reads + expected > MAX_READS) {
        pending++;
        continue;
      }

      const snap = await dateDoc.ref.collection(brandId).get();
      reads += Math.max(snap.size, 1);
      if (snap.empty) continue;

      const items = snap.docs.map((d) => toSummaryItem({ ...d.data(), productNo: d.data().productNo || d.id }));
      const doc = buildSummary(brandId, date, items);
      if (!doc) continue;

      try {
        // create(): 그 사이 크롤러가 오늘 요약을 저장했으면 덮어쓰지 않는다
        await refs[i].create({ ...doc, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        created++;
        console.log(`  ✅ ${date} [${brandId}] ${items.length}건 요약 저장 (누적 읽기 ${reads})`);
      } catch (e) {
        if (e.code === 6) { // ALREADY_EXISTS
          console.log(`  ↷ ${date} [${brandId}] 이미 요약 있음 – 건너뜀`);
        } else {
          throw e;
        }
      }
    }
  }

  console.log(`\n🏁 요약 ${created}개 생성, 읽기 약 ${reads}건 사용, 한도 때문에 남은 것 ${pending}개`);
  if (pending > 0) console.log('   → 다음 실행에서 이어서 채웁니다.');
}

main().catch((e) => {
  console.error('❌ 요약 채우기 실패:', e);
  process.exit(1);
});
