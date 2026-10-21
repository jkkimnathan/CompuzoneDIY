import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';

/**
 * 부품 카테고리 하루치 가격 목록.
 * compuzone_prices/{날짜}/{브랜드} 상품 문서와 같은 필드 이름을 쓴다.
 */
export interface DayItem {
    productNo: string;
    name?: string;
    detailUrl?: string;
    soldOut?: boolean;
    discountPrice?: number;
    originalPrice?: number;
    sellPrice?: number | null;
}

/**
 * 하루치 가격 목록을 읽는다.
 * 1순위: 크롤러가 저장한 하루 요약 문서 compuzone_summary/{브랜드}/days/{날짜} (읽기 1건)
 * 없으면: 기존처럼 그날 상품 문서 전체를 읽는다 (상품 수만큼 읽기)
 */
export async function fetchDayItems(brandId: string, date: string): Promise<DayItem[]> {
    try {
        const snap = await getDoc(doc(db, 'compuzone_summary', brandId, 'days', date));
        if (snap.exists()) {
            return (snap.data().items || []) as DayItem[];
        }
    } catch (e) {
        console.warn(`요약 문서 조회 실패 (${brandId} ${date}) – 상품 문서로 대체:`, e);
    }

    const snapshot = await getDocs(collection(db, 'compuzone_prices', date, brandId));
    return snapshot.docs.map((d) => {
        const data = d.data();
        return { ...data, productNo: data.productNo || d.id } as DayItem;
    });
}
