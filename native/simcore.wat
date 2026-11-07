;; ============================================================
;; AIRDOM simcore — هسته محاسبات سنگین (WebAssembly)
;;  ۱) ballistic_batch : انتگرال‌گیری بالستیک دسته‌ای (توپ/بمب/راکت/موشک کور)
;;  ۲) radar_scan      : معادله رادار (SNR با RCS و ناتچینگ) برای همه اهداف
;;  ۳) lead_solve/lead_batch : حل‌گر تکراری زاویه پیش‌روی توپ (pipper)
;; حافظه خطی: بدون تخصیص در حلقه بازی — اسکرچ ثابت
;; چیدمان: states@1024 ، contacts@65536 ، radarout@131072
;; ============================================================
(module
  (memory (export "memory") 4)

  ;; ---------- ballistic_batch(ptr, n, dt, gravity, linDrag) -> n ----------
  ;; حالت هر پرتابه: ۶×f64 = [x,y,z,vx,vy,vz]
  ;; a = -linDrag*v + (0,-gravity,0)
  (func (export "ballistic_batch")
    (param $ptr i32) (param $n i32) (param $dt f64) (param $g f64) (param $drag f64)
    (result i32)
    (local $i i32) (local $off i32)
    (local $vx f64) (local $vy f64) (local $vz f64)
    (local $d f64)
    (block $done
      (loop $l
        (br_if $done (i32.ge_s (local.get $i) (local.get $n)))
        (local.set $off (i32.add (local.get $ptr) (i32.mul (local.get $i) (i32.const 48))))

        (local.set $vx (f64.load offset=24 (local.get $off)))
        (local.set $vy (f64.load offset=32 (local.get $off)))
        (local.set $vz (f64.load offset=40 (local.get $off)))

        ;; مقاومت خطی: v *= (1 - drag*dt) — پایدار برای drag*dt < 1
        (local.set $d (f64.max (f64.const 0) (f64.sub (f64.const 1) (f64.mul (local.get $drag) (local.get $dt)))))
        (local.set $vx (f64.mul (local.get $vx) (local.get $d)))
        (local.set $vz (f64.mul (local.get $vz) (local.get $d)))
        ;; گرانش + مقاومت روی مؤلفه عمودی
        (local.set $vy (f64.mul (f64.sub (local.get $vy) (f64.mul (local.get $g) (local.get $dt))) (local.get $d)))

        (f64.store offset=24 (local.get $off) (local.get $vx))
        (f64.store offset=32 (local.get $off) (local.get $vy))
        (f64.store offset=40 (local.get $off) (local.get $vz))

        ;; موقعیت += v*dt
        (f64.store (local.get $off)
          (f64.add (f64.load (local.get $off)) (f64.mul (local.get $vx) (local.get $dt))))
        (f64.store offset=8 (local.get $off)
          (f64.add (f64.load offset=8 (local.get $off)) (f64.mul (local.get $vy) (local.get $dt))))
        (f64.store offset=16 (local.get $off)
          (f64.add (f64.load offset=16 (local.get $off)) (f64.mul (local.get $vz) (local.get $dt))))

        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $l)
      )
    )
    (local.get $n)
  )

  ;; ---------- radar_scan(rx,ry,rz, fx,fy,fz, gimbalCos, maxRange, thresh, ptr, n, out) -> detected ----------
  ;; هر تماس: ۵×f64 = [dx,dy,dz, rcs, mult]   (mult = ضریب ناتچینگ/جناحیت از JS)
  ;; خروجی هر تماس: ۲×f64 = [detect(0/1), snr]
  ;; snr = rcs / r^4 (نرمال ۱۰۰۰م) × mult ، مؤثر = snr × beamDot
  (func (export "radar_scan")
    (param $rx f64) (param $ry f64) (param $rz f64)
    (param $fx f64) (param $fy f64) (param $fz f64)
    (param $gimbalCos f64) (param $range f64) (param $thresh f64)
    (param $ptr i32) (param $n i32) (param $out i32)
    (result i32)
    (local $i i32) (local $coff i32) (local $ooff i32)
    (local $dx f64) (local $dy f64) (local $dz f64)
    (local $r2 f64) (local $r f64) (local $inv f64)
    (local $dot f64) (local $snr f64) (local $esnr f64)
    (local $count i32)
    (block $done
      (loop $l
        (br_if $done (i32.ge_s (local.get $i) (local.get $n)))
        (local.set $coff (i32.add (local.get $ptr) (i32.mul (local.get $i) (i32.const 40))))
        (local.set $ooff (i32.add (local.get $out) (i32.mul (local.get $i) (i32.const 16))))

        (local.set $dx (f64.sub (f64.load (local.get $coff)) (local.get $rx)))
        (local.set $dy (f64.sub (f64.load offset=8 (local.get $coff)) (local.get $ry)))
        (local.set $dz (f64.sub (f64.load offset=16 (local.get $coff)) (local.get $rz)))
        (local.set $r2 (f64.add (f64.add (f64.mul (local.get $dx) (local.get $dx))
                                         (f64.mul (local.get $dy) (local.get $dy)))
                                (f64.mul (local.get $dz) (local.get $dz))))
        (local.set $r (f64.sqrt (local.get $r2)))

        ;; پیش‌فرض: شناسایی نشده
        (f64.store (local.get $ooff) (f64.const 0))
        (f64.store offset=8 (local.get $ooff) (f64.const 0))

        (if (f64.gt (local.get $r) (f64.const 1))
          (then
            (local.set $inv (f64.div (f64.const 1) (local.get $r)))
            (local.set $dot
              (f64.add
                (f64.add
                  (f64.mul (local.get $fx) (f64.mul (local.get $dx) (local.get $inv)))
                  (f64.mul (local.get $fy) (f64.mul (local.get $dy) (local.get $inv))))
                (f64.mul (local.get $fz) (f64.mul (local.get $dz) (local.get $inv)))))
            (if (f64.gt (local.get $dot) (local.get $gimbalCos))
              (then
                (local.set $snr
                  (f64.mul
                    (f64.div (f64.load offset=24 (local.get $coff))
                             (f64.max (f64.const 1) (f64.mul (local.get $r2) (local.get $r2))))
                    (f64.load offset=32 (local.get $coff))))
                (local.set $snr (f64.mul (local.get $snr) (f64.const 1e12)))
                (local.set $esnr (f64.mul (local.get $snr) (local.get $dot)))
                (f64.store offset=8 (local.get $ooff) (local.get $esnr))
                (if (f64.gt (local.get $esnr) (local.get $thresh))
                  (then
                    (if (f64.lt (local.get $r) (local.get $range))
                      (then
                        (f64.store (local.get $ooff) (f64.const 1))
                        (local.set $count (i32.add (local.get $count) (i32.const 1)))
                      )
                    )
                  )
                )
              )
            )
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $l)
      )
    )
    (local.get $count)
  )

  ;; ---------- lead_batch(ptr, n, mv) -> n ----------
  ;; ورودی هر آیتم ۱۰×f64 = [tx,ty,tz, vx,vy,vz, px,py,pz, unused]
  ;; خروجی: اسلات آخر = زمان برخورد t (حل ۷ تکراری)
  (func (export "lead_batch")
    (param $ptr i32) (param $n i32) (param $mv f64)
    (result i32)
    (local $i i32) (local $off i32)
    (local $t f64)
    (block $done
      (loop $l
        (br_if $done (i32.ge_s (local.get $i) (local.get $n)))
        (local.set $off (i32.add (local.get $ptr) (i32.mul (local.get $i) (i32.const 80))))
        (local.set $t
          (call $leadInner
            (f64.load (local.get $off))
            (f64.load offset=8 (local.get $off))
            (f64.load offset=16 (local.get $off))
            (f64.load offset=24 (local.get $off))
            (f64.load offset=32 (local.get $off))
            (f64.load offset=40 (local.get $off))
            (f64.load offset=48 (local.get $off))
            (f64.load offset=56 (local.get $off))
            (f64.load offset=64 (local.get $off))
            (local.get $mv)))
        (f64.store offset=72 (local.get $off) (local.get $t))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $l)
      )
    )
    (local.get $n)
  )

  ;; lead_inner — همان حل تکراری برای فراخوانی تکی از JS
  (func $leadInner (export "lead_solve")
    (param $tx f64) (param $ty f64) (param $tz f64)
    (param $vx f64) (param $vy f64) (param $vz f64)
    (param $px f64) (param $py f64) (param $pz f64)
    (param $mv f64)
    (result f64)
    (local $t f64) (local $ax f64) (local $ay f64) (local $az f64)
    (local $k f64) (local $i i32)
    (local.set $mv (f64.max (local.get $mv) (f64.const 1)))
    (local.set $ax (f64.sub (local.get $tx) (local.get $px)))
    (local.set $ay (f64.sub (local.get $ty) (local.get $py)))
    (local.set $az (f64.sub (local.get $tz) (local.get $pz)))
    (local.set $t
      (f64.div
        (f64.sqrt (f64.add (f64.add (f64.mul (local.get $ax) (local.get $ax))
                                    (f64.mul (local.get $ay) (local.get $ay)))
                           (f64.mul (local.get $az) (local.get $az))))
        (local.get $mv)))
    (block $done
      (loop $l
        (br_if $done (i32.ge_s (local.get $i) (i32.const 7)))
        (local.set $ax (f64.sub (f64.add (local.get $tx) (f64.mul (local.get $vx) (local.get $t))) (local.get $px)))
        (local.set $ay (f64.sub (f64.add (local.get $ty) (f64.mul (local.get $vy) (local.get $t))) (local.get $py)))
        (local.set $az (f64.sub (f64.add (local.get $tz) (f64.mul (local.get $vz) (local.get $t))) (local.get $pz)))
        (local.set $k
          (f64.sqrt (f64.add (f64.add (f64.mul (local.get $ax) (local.get $ax))
                                      (f64.mul (local.get $ay) (local.get $ay)))
                             (f64.mul (local.get $az) (local.get $az)))))
        (local.set $t (f64.div (local.get $k) (local.get $mv)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $l)
      )
    )
    (local.get $t)
  )
)
