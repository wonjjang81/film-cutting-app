import { describe, it } from 'vitest';
import { placeFilmPieces, FilmPiece, FILM_WIDTH } from '../lib/filmCutting';

describe('배치 알고리즘 효율성 벤치마크', () => {
  function bench(name: string, pieces: FilmPiece[]) {
    const totalArea = pieces.reduce(
      (s, p) => s + p.width * p.height * p.quantity, 0
    );
    const t1 = performance.now();
    const result = placeFilmPieces(pieces, FILM_WIDTH, '', true);
    const t2 = performance.now();

    const filmHeightM = result.filmHeight / 1000;
    const usedAreaCm2 = (result.filmHeight * FILM_WIDTH) / 100;
    const totalAreaCm2 = totalArea / 100;
    const wasteCm2 = usedAreaCm2 - totalAreaCm2;

    console.log(`\n[${name}]`);
    console.log(`  필름 길이: ${filmHeightM.toFixed(3)}m`);
    console.log(`  효율: ${result.efficiency.toFixed(1)}%`);
    console.log(`  낭비 면적: ${(wasteCm2/100).toFixed(2)}m² (${(wasteCm2/usedAreaCm2*100).toFixed(1)}%)`);
    console.log(`  소요시간: ${(t2-t1).toFixed(1)}ms`);
    console.log(`  배치된 조각: ${result.pieces.length}개`);
  }

  it('케이스 1: 작은 조각 다수 (균일 크기)', () => {
    const pieces: FilmPiece[] = [
      { id: 'A_01', width: 600, height: 400, quantity: 6 },
      { id: 'A_02', width: 600, height: 400, quantity: 6 },
    ];
    bench('소형 조각 12개 (600x400)', pieces);
  });

  it('케이스 2: 다양한 크기 조합', () => {
    const pieces: FilmPiece[] = [
      { id: 'A_01', width: 1000, height: 500, quantity: 2 },
      { id: 'A_02', width: 600, height: 400, quantity: 3 },
      { id: 'A_03', width: 300, height: 200, quantity: 5 },
      { id: 'A_04', width: 800, height: 300, quantity: 2 },
    ];
    bench('혼합 크기 조각 12개', pieces);
  });

  it('케이스 3: 큰 조각 + 자투리 채우기', () => {
    const pieces: FilmPiece[] = [
      { id: 'A_01', width: 1200, height: 800, quantity: 2 },
      { id: 'A_02', width: 200, height: 200, quantity: 10 },
      { id: 'A_03', width: 100, height: 100, quantity: 20 },
    ];
    bench('대형+소형 조합 32개', pieces);
  });

  it('케이스 4: 무늬 고정 (회전 금지)', () => {
    const pieces: FilmPiece[] = [
      { id: 'A_01', width: 600, height: 400, quantity: 6 },
      { id: 'A_02', width: 600, height: 400, quantity: 6 },
    ];
    const result = placeFilmPieces(pieces, FILM_WIDTH, '', false);
    console.log(`\n[무늬 고정 - 소형 조각 12개]`);
    console.log(`  필름 길이: ${(result.filmHeight/1000).toFixed(3)}m`);
    console.log(`  효율: ${result.efficiency.toFixed(1)}%`);
    // 모든 조각이 회전 없이 width=600 유지
    const allOriginal = result.pieces.every(p => p.width === 600 && p.height === 400);
    console.log(`  방향 고정 유지: ${allOriginal ? '✓' : '✗'}`);
  });

  it('케이스 5: 부엌 인테리어 시뮬레이션 (실제 케이스)', () => {
    const pieces: FilmPiece[] = [
      { id: '상부장', width: 700, height: 800, quantity: 4 },
      { id: '하부장', width: 700, height: 600, quantity: 4 },
      { id: '서랍', width: 350, height: 200, quantity: 8 },
      { id: '문짝', width: 450, height: 800, quantity: 6 },
    ];
    bench('부엌 인테리어 22개 조각', pieces);
  });
});
