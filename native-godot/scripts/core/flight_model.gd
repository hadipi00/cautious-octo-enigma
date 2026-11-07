# ============================================================
# flight_model.gd — مدل پرواز ۶-درجه‌آزادی واقعی‌گرا (سبک وارتاندر RB)
# ------------------------------------------------------------
# • اتمسفر ISA واقعی (چگالی/ماخ بر حسب ارتفاع)
# • برآ: CL(α) با واماندگی نرم + فلپ؛ پسا: قطبی پارابولیک
#   (CD0 + k·CL²) + پسای گذار صوتی + چرخ/ترمز/فلپ
# • رانش: لختی اسپول، افت با ارتفاع، رَم‌ایر، افتربرنر، مصرف سوخت
# • FBW: فرمان → نرخ زاویه‌ای مطلوب (متناسب با فشار دینامیکی)
#   + پایداری استاتیکی + میرایی + ریزش بال در واماندگی
# • G-سنج خلبان (سیاهی/سرخی چشم)
# • زمین: جذب فنری، اصطکاک غلتشی/ترمز/جانبی، فرمان چرخ دماغه
# بدون وابستگی به صحنه — تست‌پذیر headless
# قرارداد: دماغه −Z ، بالا +Y ، راست +X (استاندارد Godot)
# ============================================================
class_name FlightModel

const G := 9.80665
const RHO0 := 1.225
const DEG := PI / 180.0

static func new_state(spec: Dictionary) -> Dictionary:
	return {
		"pos": Vector3.ZERO,
		"vel": Vector3.ZERO,
		"quat": Quaternion.IDENTITY,
		"ang": Vector3.ZERO,          # [پیچ، انحراف، غلتش] rad/s قاب بدنه
		"fuel": spec.get("fuelCap", 2000.0),
		"thr": 0.0,
		"ab": false,
		"on_ground": true,
		"hp": spec.get("hp", 100.0),
		"alive": true,
		"alpha": 0.0, "beta": 0.0, "mach": 0.0, "V": 0.0, "q_dyn": 0.0,
		"g_force": 1.0, "stalled": false, "blackout": 0.0, "redout": 0.0,
		"gFilt": 1.0, "aFilt": 0.0,
		"engine_fire": false, "gear": true, "flaps": 0.0, "brake": false,
		"stallT": 0.0,
	}

static func step(st: Dictionary, spec: Dictionary, inp: Dictionary, dt: float) -> void:
	if not st.alive:
		return

	var mass: float = spec.get("mass", 9000.0) + st.fuel
	var atm := ISA.at(st.pos.y)
	var rho: float = atm[2]
	var sound: float = atm[3]

	# ---------- سرعت در قاب بدنه ----------
	var vb: Vector3 = st.quat.inverse() * st.vel
	var fwd: float = -vb.z
	var V: float = st.vel.length()
	st.V = V
	st.mach = V / maxf(sound, 1.0)
	st.q_dyn = 0.5 * rho * V * V
	if V > 1.0:
		st.alpha = atan2(-vb.y, maxf(fwd, 0.5))
		st.beta = atan2(vb.x, maxf(fwd, 0.5))
	else:
		st.alpha = 0.0
		st.beta = 0.0

	# ---------- آسیب → کاهش اختیار ----------
	var dmg := 1.0
	if st.hp < 0.25 * st.hp:
		dmg = 0.35
	elif st.hp < 0.5 * st.hp:
		dmg = 0.6
	if st.engine_fire:
		dmg = minf(dmg, 0.3)

	# ---------- موتور ----------
	var tau: float = 1.1 if not st.ab else 1.7
	st.thr += (inp.throttle - st.thr) * minf(1.0, dt / tau)
	st.ab = bool(inp.ab) and st.thr > 0.85 and st.fuel > 0.0
	var lapse := pow(clampf(rho / RHO0, 0.05, 1.1), 0.78)
	var ram := 1.0 + 0.22 * maxf(st.mach - 0.3, 0.0)
	var thrust: float = spec.get("thrustMil", 60000.0) * lapse * ram * st.thr * dmg
	if st.ab:
		thrust += spec.get("thrustAB", 0.0) * lapse * ram * dmg
	var burn := 0.0
	if thrust > 100.0:
		burn = spec.get("burnMil", 0.9) * st.thr
		if st.ab:
			burn += spec.get("burnAB", 3.5)
	st.fuel = maxf(0.0, st.fuel - burn * dt)
	if st.fuel <= 0.0:
		thrust *= maxf(0.0, 1.0 - 0.5 * dt)

	# ---------- ضرایب آیرودینامیکی ----------
	var wing_area: float = spec.get("wingArea", 28.0)
	var AR: float = _aspect_ratio(spec)
	var k_ind: float = 1.0 / (PI * AR * spec.get("oswald", 0.82))
	var aStall: float = spec.get("aStall", 15.0) * DEG

	var flaps: float = st.flaps
	var CL_lin: float = spec.get("CL0", 0.02) + 0.45 * flaps + spec.get("CLa", 4.5) * st.alpha
	var stall_mix: float = smoothstep_f(aStall * 0.85, aStall * 1.15, absf(st.alpha))
	# برآ گردابی (LERX/vortex lift) — جت‌های واقعی بالای ۱۰° نرم می‌شوند نه می‌ریزند
	var vortex: float = 0.38 * smoothstep_f(8.0 * DEG, 24.0 * DEG, st.alpha)
	CL_lin += vortex * (1.0 - stall_mix * 0.55)
	var CL_flat: float = 1.05 * sin(2.0 * st.alpha) + 0.35
	var CL: float = lerp(CL_lin, CL_flat, stall_mix) if absf(st.alpha) < PI * 0.5 else 0.0
	st.stalled = stall_mix > 0.25 and V > 15.0 and not st.on_ground
	st.stallT = (st.stallT + dt) if st.stalled else 0.0

	var CD: float = spec.get("CD0", 0.021) + k_ind * CL * CL
	CD += 0.021 * (1.0 if st.gear else 0.0) + 0.05 * flaps + (0.075 if st.brake else 0.0)
	var mdd: float = spec.get("mdd", 0.82)
	if st.mach > mdd:
		CD += 0.042 * smoothstep_f(mdd, mdd + 0.18, st.mach)
		CD += 0.028 * exp(-pow((st.mach - 1.06) / 0.16, 2.0))
	var CY: float = -1.15 * st.beta

	# ---------- نیروها (جهانی) ----------
	var q: float = st.q_dyn
	var up_b: Vector3 = st.quat * Vector3.UP          # بالای بدنه در جهان
	var right_b: Vector3 = st.quat * Vector3.RIGHT
	var F := Vector3.ZERO
	F += up_b * (q * wing_area * CL)
	F += right_b * (q * wing_area * CY)
	if V > 0.5:
		F += -st.vel.normalized() * (q * wing_area * CD)
	F += st.quat * Vector3.FORWARD * thrust           # دماغه −Z
	F += Vector3.DOWN * (mass * G)

	# G خلبان = شتاب غیرگرانشی در راستای بالای بدنه
	var a_no_g := F / mass - Vector3.DOWN * G
	st.g_force = a_no_g.dot(up_b) / G
	st.gFilt = lerpf(st.gFilt, st.g_force, minf(1.0, dt * 5.0))
	st.aFilt = lerpf(st.aFilt, st.alpha, minf(1.0, dt * 6.0))
	var gMax: float = spec.get("maxG", 9.0)
	if st.g_force > gMax:
		st.blackout = minf(1.0, st.blackout + dt * (st.g_force - gMax) * 0.55)
	else:
		st.blackout = maxf(0.0, st.blackout - dt * 0.5)
	if st.g_force < -2.5:
		st.redout = minf(1.0, st.redout + dt * (-st.g_force - 2.5) * 0.6)
	else:
		st.redout = maxf(0.0, st.redout - dt * 0.7)

	st.vel += F * (dt / mass)

	# ---------- گشتاورها (گیاه + کنترل‌گر FBW) ----------
	# شتاب زاویه‌ای = اختیار کنترل + پایداری استاتیکی + میرایی
	var ctrl := clampf(q / 1500.0, 0.0, 1.5) * dmg
	var stab := clampf(q / 3000.0, 0.0, 1.3) * dmg

	var pitch_in: float = clampf(inp.pitch, -1.0, 1.0)
	var roll_in: float = clampf(inp.roll, -1.0, 1.0)
	var yaw_in: float = clampf(inp.yaw, -1.0, 1.0)
	# محافظ G — نزدیک حد سازه، فرمان پیچ محدود می‌شود (FBW واقعی)
	var g_protect: float = clampf((gMax * 1.06 - st.gFilt) * 0.5, 0.25, 1.0)
	pitch_in *= lerpf(0.30, 1.0, g_protect)
	# ضعف با سیاهی چشم
	pitch_in *= 1.0 - st.blackout * 0.65
	roll_in *= 1.0 - st.blackout * 0.5
	yaw_in *= 1.0 - st.blackout * 0.5

	var pitch_acc: float = pitch_in * spec.get("pitchRate", 18.0) * DEG * 3.0 * ctrl
	var roll_acc: float = -roll_in * spec.get("rollRate", 180.0) * DEG * 2.6 * ctrl
	var yaw_acc: float = -yaw_in * spec.get("yawRate", 8.0) * DEG * 2.4 * ctrl

	# پایداری استاتیکی (بازگرداندن دماغه به بردار سرعت)
	pitch_acc += -st.alpha * 3.5 * stab
	yaw_acc += -st.beta * 4.0 * stab
	roll_acc += st.beta * 1.2 * stab      # دیدرال

	# محافظ زاویه حمله — بالای حدِ واماندگی، دماغه پایین
	var alpha_lim: float = spec.get("aStall", 15.0) * DEG * 0.93
	if st.aFilt > alpha_lim:
		pitch_acc -= (st.aFilt - alpha_lim) * 3.0 * stab
	elif st.aFilt < -alpha_lim * 0.7:
		pitch_acc += (-st.aFilt - alpha_lim * 0.7) * 3.0 * stab

	# ریزش بال در واماندگی
	if st.stalled and not st.on_ground:
		var drop: float = clampf((absf(st.alpha) - alpha_lim) / maxf(alpha_lim, 0.01), 0.0, 1.3)
		var side: float = signf(st.beta) if absf(st.beta) > 0.02 else (1.0 if fmod(st.pos.x * 13.7, 2.0) > 1.0 else -1.0)
		roll_acc += side * drop * 2.4
		pitch_acc -= drop * 1.2

	# میرایی آیرودینامیک (∝ نرخ زاویه‌ای)
	pitch_acc += -st.ang.x * 3.4 * stab
	yaw_acc += -st.ang.y * 2.6 * stab
	roll_acc += -st.ang.z * 5.0 * stab

	st.ang.x += pitch_acc * dt
	st.ang.y += yaw_acc * dt
	st.ang.z += roll_acc * dt

	# یکپارچه‌سازی کواترنیون: q̇ = ½·q⊗ω  (ω در قاب بدنه)
	var wq := Quaternion(st.ang.x, st.ang.y, st.ang.z, 0.0)
	var dq: Quaternion = wq * st.quat
	st.quat = (st.quat + dq * (0.5 * dt)).normalized()

	# ---------- زمین ----------
	_ground(st, spec, inp, dt)

	# ---------- موقعیت ----------
	st.pos += st.vel * dt
	if st.pos.y < -50.0:
		st.alive = false

static func _ground(st: Dictionary, spec: Dictionary, inp: Dictionary, dt: float) -> void:
	var gy: float = spec.get("_ground_y", 0.0)
	var contact_h: float = spec.get("gearH", 2.0) if st.gear else spec.get("bellyH", 1.0)
	var up: Vector3 = st.quat * Vector3.UP
	st.on_ground = (st.pos.y <= gy + maxf(contact_h, 1.2)) and up.y > 0.25
	if not st.on_ground:
		return

	var pen: float = (gy + contact_h) - st.pos.y
	if pen > 0.0:
		st.pos.y += pen * minf(1.0, dt * 12.0)
		if st.vel.y < 0.0:
			st.vel.y *= 0.35

	var vb: Vector3 = st.quat.inverse() * st.vel
	var fwd_speed := -vb.z
	var brake_mu: float = 0.55 if st.brake else 0.0
	var dec: float = (0.02 + brake_mu) * G * dt * signf(fwd_speed) * minf(absf(fwd_speed) / 3.0, 1.0)
	vb.z += dec
	vb.x -= clampf(vb.x, -1.0, 1.0) * 0.85 * G * dt

	# فرمان چرخ دماغه
	if st.gear and absf(fwd_speed) > 0.5:
		var steer: float = clampf(inp.yaw, -1.0, 1.0)
		var turn: float = steer * clampf(28.0 - absf(fwd_speed) * 0.14, 4.0, 28.0) * DEG * dt
		var upv: Vector3 = st.quat * Vector3.UP
		st.quat = Quaternion(upv, turn) * st.quat

	# روی زمین، جهت حرکت به سمت دماغه برمی‌گردد (چرخ‌ها)
	var gvel: Vector3 = Vector3(st.vel.x, 0.0, st.vel.z)
	if gvel.length() > 2.0:
		var planar_fwd: Vector3 = st.quat * Vector3.FORWARD
		planar_fwd.y = 0.0
		if planar_fwd.length() > 0.1:
			var align: Quaternion = Quaternion(planar_fwd.normalized(), gvel.normalized())
			st.quat = align * st.quat

	st.vel = st.quat * vb
	if pen > 0.0:
		st.vel.y = maxf(st.vel.y, 0.0)

static func smoothstep_f(a: float, b: float, x: float) -> float:
	var t: float = clampf((x - a) / maxf(b - a, 1e-6), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)

static func _aspect_ratio(spec: Dictionary) -> float:
	var span: float = spec.get("wingSpan", 10.0)
	var area: float = spec.get("wingArea", 28.0)
	return span * span / maxf(area, 1.0)
