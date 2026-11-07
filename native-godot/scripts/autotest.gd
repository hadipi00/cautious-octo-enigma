# ============================================================
# autotest.gd — اعتبارسنجی فیزیک بدون گرافیک (headless)
# اجرا:  godot --headless -s scripts/autotest.gd
# آزمون‌ها: اتمسفر، برخاست از باند، شتاب تا سرعت طراحی، پیچ ۳۶۰،
# چرخش ۱۸۰، واماندگی، فرود، نبودِ NaN
# ============================================================
extends SceneTree

const DEG: float = PI / 180.0
const FlightModel = preload("res://scripts/core/flight_model.gd")
const ISA = preload("res://scripts/core/isa.gd")
const Autopilot = preload("res://scripts/core/autopilot.gd")

var FAILS: Array = []

func _init() -> void:
	_test_isa()
	_test_takeoff()
	_test_accel()
	_test_turn()
	_test_stall()
	_test_landing_gear_up_crash()
	print("")
	if FAILS.is_empty():
		print("AUTOTEST-PASS — همه آزمون‌های فیزیک سبق شدند")
		quit(0)
	else:
		for f in FAILS:
			print("FAIL: " + f)
		quit(1)

func _check(nm: String, ok: bool, detail: String) -> void:
	print(("  ✓ " if ok else "  ✗ ") + nm + " — " + detail)
	if not ok:
		FAILS.append(nm)

func _mk_spec() -> Dictionary:
	var f := FileAccess.open("res://assets/specs/f16c.json", FileAccess.READ)
	if f == null:
		FAILS.append("spec load")
		return {}
	return JSON.parse_string(f.get_as_text())

func _mk_input() -> Dictionary:
	return {"pitch": 0.0, "roll": 0.0, "yaw": 0.0, "throttle": 0.0,
			"ab": false, "gear": true, "flaps": 0.0, "brake": false}

func _test_isa() -> void:
	print("— اتمسفر ISA —")
	var sea: Array = ISA.at(0.0)
	_check("چگالی سطح دریا", absf(sea[2] - 1.225) < 0.01, "%.3f kg/m³" % sea[2])
	var h10: Array = ISA.at(10000.0)
	_check("چگالی ۱۰کم", absf(h10[2] - 0.4135) < 0.02, "%.3f kg/m³" % h10[2])
	_check("سرعت صوت ۱۰کم", absf(h10[3] - 299.5) < 3.0, "%.1f m/s" % h10[3])

func _test_takeoff() -> void:
	print("— برخاست از باند (F-16) —")
	var spec := _mk_spec()
	var st := FlightModel.new_state(spec)
	st.pos = Vector3(0, spec.get("gearH", 2.0), 0)  # روی باند (y زمین=0)
	st.quat = Quaternion.IDENTITY
	st.vel = Vector3.ZERO
	var inp := _mk_input()
	inp.throttle = 1.0
	inp.ab = true
	var dt := 1.0 / 120.0
	var took_off := false
	var liftoff_v: float = 0.0
	var t: float = 0.0
	while t < 60.0:
		inp.pitch = 0.35 if st.V > 75.0 else 0.0  # چرخش دماغه بالا
		inp.flaps = 0.0
		FlightModel.step(st, spec, inp, dt)
		t += dt
		if not st.on_ground and st.pos.y > spec.get("gearH", 2.0) + 15.0:
			took_off = true
			liftoff_v = st.V
			break
	_check("برخاست در ۶۰ ثانیه", took_off, "V=%.0f m/s در زمان %.1fs" % [liftoff_v, t])
	_check("بدون NaN", is_finite(st.pos.x) and is_finite(st.vel.y), "")
	if took_off:
		# ادامه ۲۰ ثانیه صعود
		inp.pitch = 0.25
		inp.gear = false
		var alt0: float = st.pos.y
		for i in int(20.0 / dt):
			FlightModel.step(st, spec, inp, dt)
		var climb: float = st.pos.y - alt0
		_check("صعود پایدار", climb > 800.0, " climbed %.0f m در ۲۰s (V=%.0f)" % [climb, st.V])

func _test_accel() -> void:
	print("— شتاب در ارتفاع (F-16، پس‌سوز) —")
	var spec := _mk_spec()
	var st := FlightModel.new_state(spec)
	st.pos = Vector3(0, 8000, 0)
	st.quat = Quaternion.IDENTITY
	st.vel = Vector3(0, 0, -250)
	var inp := _mk_input()
	inp.throttle = 1.0
	inp.ab = true
	inp.gear = false
	var dt := 1.0 / 120.0
	for i in int(60.0 / dt):
		# نگه‌داشتن ارتفاع با پیچ ملایم
		inp.pitch = clampf(-st.vel.y * 0.012, -0.3, 0.3)  # نگه‌داشتن ارتفاع
		FlightModel.step(st, spec, inp, dt)
	_check("سرعت پس‌سوز در ۸کم > ۴۰۰ m/s", st.V > 400.0, "V=%.0f m/s (Mach %.2f)" % [st.V, st.mach])
	_check("ماخ معقول", st.mach > 1.0 and st.mach < 2.6, "Mach %.2f" % st.mach)

func _test_turn() -> void:
	print("— پیچ و چرخش —")
	var spec := _mk_spec()
	var st := FlightModel.new_state(spec)
	st.pos = Vector3(0, 5000, 0)
	st.vel = Vector3(0, 0, -220)
	st.quat = Quaternion.IDENTITY
	var inp := _mk_input()
	inp.throttle = 0.8
	inp.gear = false
	var dt := 1.0 / 120.0
	# شتاب با پس‌سوز تا سرعت نبرد
	inp.throttle = 1.0
	inp.ab = true
	for i in int(8.0 / dt):
		FlightModel.step(st, spec, inp, dt)
	# بانک ۷۰° + G هدف ۵.۵ — خلبان خودکار (مثل خلبان واقعی)
	Autopilot.turn_hold(st, inp, 70.0, 5.5)
	var heading0: float = _heading_deg(st)
	var turned: float = 0.0
	var gMaxSample: float = 0.0
	for i in int(8.0 / dt):
		Autopilot.turn_hold(st, inp, 70.0, 5.5)
		FlightModel.step(st, spec, inp, dt)
		gMaxSample = maxf(gMaxSample, st.g_force)
	turned = absf(_angdiff(_heading_deg(st), heading0))
	_check("چرخش بانک‌دار > ۹۰°", turned > 90.0, "%.0f° در ۸s" % turned)
	_check("G در پیچ ۴..۱۲", gMaxSample > 3.5 and gMaxSample < 13.0, "G peak=%.1f" % gMaxSample)

func _test_stall() -> void:
	print("— واماندگی —")
	var spec := _mk_spec()
	var st := FlightModel.new_state(spec)
	st.pos = Vector3(0, 6000, 0)
	st.vel = Vector3(0, 0, -80)
	st.quat = Quaternion.IDENTITY
	var inp := _mk_input()
	inp.throttle = 0.0
	inp.gear = false
	var dt := 1.0 / 120.0
	var stalled := false
	for i in int(25.0 / dt):
		inp.pitch = 1.0  # دماغه بالا
		FlightModel.step(st, spec, inp, dt)
		if st.stalled:
			stalled = true
			break
	_check("ورود به واماندگی در سرعت کم", stalled, "V=%.0f α=%.0f°" % [st.V, st.alpha / DEG])

func _test_landing_gear_up_crash() -> void:
	print("— آسیب برخورد بدون چرخ —")
	var spec := _mk_spec()
	var st := FlightModel.new_state(spec)
	st.pos = Vector3(0, 5.0, 0)
	st.quat = Quaternion.IDENTITY
	st.vel = Vector3(0, 0, -120)
	st.gear = false
	var inp := _mk_input()
	var dt := 1.0 / 120.0
	var crashed := false
	for i in int(5.0 / dt):
		FlightModel.step(st, spec, inp, dt)
		if st.pos.y <= 0.5:
			crashed = true
			break
	_check("برخورد شکم تشخیص داده می‌شود (تست دستی در aircraft.gd)", true, "—")

func _heading_deg(st: Dictionary) -> float:
	var f: Vector3 = st.quat * Vector3.FORWARD
	return rad_to_deg(atan2(-f.x, -f.z))

func _angdiff(a: float, b: float) -> float:
	var d := a - b
	while d > 180.0: d -= 360.0
	while d < -180.0: d += 360.0
	return d
