'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot } from 'firebase/firestore';

/**
 * Firestore의 compuzone_prices 컬렉션에서 저장된 날짜 목록을 실시간 조회.
 * 최신 날짜를 기본값으로 반환.
 */
export function useAvailableDates() {
    const [dates, setDates] = useState<string[]>([]);
    const [latestDate, setLatestDate] = useState<string>('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const colRef = collection(db, 'compuzone_prices');

        const unsubscribe = onSnapshot(
            colRef,
            (snapshot) => {
                const dateList = snapshot.docs
                    .map((doc) => doc.id)
                    .filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id)) // YYYY-MM-DD 형식만
                    .sort((a, b) => b.localeCompare(a)); // 최신순 정렬

                // 크롤러가 날짜 문서를 고칠 때마다(updatedAt 등) 스냅샷이 다시 오는데,
                // 날짜 목록이 그대로면 같은 배열을 유지해야 이 목록을 쓰는 화면이
                // 30일치를 처음부터 다시 읽지 않는다.
                setDates((prev) => (prev.join(',') === dateList.join(',') ? prev : dateList));
                setLatestDate(dateList[0] || '');
                setLoading(false);
            },
            (err) => {
                console.error('날짜 목록 조회 오류:', err);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, []);

    return { dates, latestDate, loading };
}
