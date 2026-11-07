# ============================================================
# ai_pilot.gd — خلبان هوش مصنوعی (تعقیب پیشرو + گریز از موشک + بانک/G)
# از Autopilot استفاده می‌کند؛ مهارت: دقت نشانه‌گیری و واکنش
# ============================================================
class_name AIPilot
extends RefCounted

const AutopilotG = preload("res://scripts/core/autopilot.gd")

var skill := 0.8
var target: Aircraft = null
var evade_t := 0.0
var _evade_dir := 1.0
var _think_t := 0.0
var last_err := 9.9
var last_dist := 0.0
var passive := false
var weapons = null
var game = null

func _init(skill_: float, game_ref) -> void:
	skill = skill_
	game = game_ref

func update(dt: float, ac: Aircraft) -> void:
	var inp: Dictionary = ac.input
	_think_t -= dt
	# انتخاب هدف
	if _think_t <= 0.0:
		_think_t = 0.5
		target = _pick_target(ac)
	# گریز از موشک
	var weapons_node = game.weapons if game != null else null
	var inbound := false
	if not passive and weapons_node != null and weapons_node.any_missile_inbound(ac):
		inbound = true
	if inbound and evade_t <= 0.0 and randf() < 0.9:
		evade_t = 4.0 + randf() * 3.0
		_evade_dir = 1.0 if randf() < 0.5 else -1.0
		if randf() < 0.7:
			ac.drop_flares()
	if evade_t > 0.0:
		evade_t -= dt
		# چرخش تند + سقوط آزاد کنترل‌شده (ناتچ)
		AutopilotG.turn_hold(ac.st, inp, 80.0 * _evade_dir, 3.0)
		inp.throttle = 1.0
		inp.ab = true
		return
	if target == null:
		# گشت: بانک ملایم
		AutopilotG.turn_hold(ac.st, inp, 15.0, 1.5)
		inp.throttle = 0.8
		return
	# ---------- محافظ ارتفاع (نزدیک زمین: دماغه بالا، باز هم شلیک) ----------
	var gy: float = game.terrain.ground_height(ac.st.pos.x, ac.st.pos.z) if game != null and game.terrain != null else 0.0
	var agl: float = ac.st.pos.y - gy
	last_err = -2.0  # نشانگر حالت
	if agl < 350.0:
		AutopilotG.level_hold(ac.st, inp)
		inp.pitch = 1.0
		inp.throttle = 1.0
		inp.ab = true
		return

	# ---------- تعقیب پیشرو ----------
	var to_t: Vector3 = target.global_position - ac.global_position
	var dist := to_t.length()
	var closing := clampf(dist / 900.0, 0.1, 3.5)
	var aim: Vector3 = target.global_position + target.st.vel * closing * (0.55 + 0.4 * skill)
	var loc: Vector3 = ac.st.quat.inverse() * (aim - ac.global_position).normalized()
	var azim := atan2(loc.x, -loc.z)      # مثبت = هدف راست
	var elev := atan2(loc.y, maxf(sqrt(loc.x * loc.x + loc.z * loc.z), 0.01))
	# بانک به سمت هدف — مصمم (تعقیب جدی)
	var want_bank := clampf(azim * 1.3, -1.25, 1.25)
	var g_hold := 1.0 / maxf(cos(clampf(absf(want_bank), 0.0, 1.4)), 0.28)
	var want_g := clampf(maxf(1.0 + absf(elev) * 8.0 + absf(azim) * 3.0, g_hold + 0.5),
			1.3, 6.5)
	# محدودیت انرژی
	want_g = minf(want_g, maxf(2.2, ac.st.V / 55.0))
	# ارتفاع کاری در تعقیب دور
	if dist > 2500.0:
		aim.y += clampf((2200.0 - agl) * 0.10, -120.0, 400.0)
	AutopilotG.turn_hold(ac.st, inp, want_bank / (PI / 180.0), want_g)
	# بازگشت ملایم به ارتفاع کاری
	if elev < 0.05 and dist > 2500.0 and ac.st.pos.y - gy < 2200.0:
		inp.pitch = clampf(inp.pitch + 0.12, -1.0, 1.0)
	inp.throttle = 1.0 if dist > 800 else 0.75
	inp.ab = dist > 1500
	inp.yaw = clampf(azim * 0.4, -0.4, 0.4)
	# شلیک
	var err := sqrt(azim * azim + elev * elev)
	last_err = err
	last_dist = dist
	inp.fire = dist < 1700.0 and err < 0.18
	# موشک
	if dist < 9000 and dist > 600 and lock_ready(ac) and randf() < 0.05 * skill:
		ac.lock_target = target
		ac.lock_t = 1.5
		ac.fire_missile()

func lock_ready(ac: Aircraft) -> bool:
	return ac._msl_cd <= 0.0 and ac.msl_stations.any(func(s): return s.left > 0)

func _pick_target(ac: Aircraft) -> Aircraft:
	var best: Aircraft = null
	var bd := 1e12
	var list: Array = game.aircraft if game != null else []
	for e in list:
		if not e.alive or e.team == ac.team:
			continue
		var d: float = e.global_position.distance_to(ac.global_position)
		if d < bd:
			bd = d
			best = e
	return best
