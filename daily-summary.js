// ─────────────────────────────────────────────
// 하루 요약 문서 (부품 카테고리 전용)
//   구조: compuzone_summary/{브랜드명}/days/{날짜}
//   { date, brand, count, items: [{ productNo, name, detailUrl, soldOut,
//                                   discountPrice, originalPrice, sellPrice }] }
//
//   대시보드의 30일 가격표는 원래 날짜마다 상품 문서를 전부 읽어서
//   (그래픽카드 30일 ≈ 17,000 읽기) Firestore 무료 읽기 한도(5만/일)를 넘겼다.
//   하루치 가격을 문서 1개에 모아 두면 30일 = 30 읽기로 끝난다.
//   기존 compuzone_prices 데이터는 그대로 두고 이 문서만 추가로 저장한다.
// ─────────────────────────────────────────────

// Firestore 문서 최대 1MiB – 여유를 두고 이보다 크면 요약 저장을 건너뛴다
// (대시보드는 요약이 없으면 기존 방식으로 읽는다)
const MAX_SUMMARY_BYTES = 900 * 1024;

function summaryRef(db, brandId, date) {
  return db.collection('compuzone_summary').doc(brandId).collection('days').doc(date);
}

function toSummaryItem(p) {
  return {
    productNo: String(p.productNo || ''),
    name: p.name || '',
    detailUrl: p.detailUrl || '',
    soldOut: !!p.soldOut,
    discountPrice: Number(p.discountPrice) || 0,
    originalPrice: Number(p.originalPrice) || 0,
    // 과거 데이터에는 sellPrice가 없을 수 있다 – null로 두면 대시보드가 originalPrice로 대체
    sellPrice: p.sellPrice === undefined || p.sellPrice === null ? null : Number(p.sellPrice) || 0,
  };
}

// items를 요약 문서 형태로 만든다. 너무 크면 null.
function buildSummary(brandId, date, items) {
  const doc = { date, brand: brandId, count: items.length, items };
  const bytes = Buffer.byteLength(JSON.stringify(doc), 'utf8');
  if (bytes > MAX_SUMMARY_BYTES) {
    console.log(`  ⚠ [${brandId}] 요약 문서가 너무 큼 (${Math.round(bytes / 1024)}KB) – 요약 저장 생략`);
    return null;
  }
  return doc;
}

module.exports = { summaryRef, toSummaryItem, buildSummary };
