# ============================================================
# aircraft.gd — نود جنگنده: مدل + فیزیک + آسیب + انیمیشن + تسلیحات
# بازیکن و AI مشترک. فیزیک در FlightModel (استاتیک و تست‌شده)
# ============================================================
class_name Aircraft
extends Node3D

signal died(ac: Aircraft, killer)

const FlightModelG = preload("res://scripts/core/flight_model.gd")
const JetBuilderG = preload("res://scripts/planes/jet_builder.gd")

var spec: Dictionary
var st: Dictionary
var team := "blue"
var is_player := false
var display_name := ""
var ai = null                     # AIPilot
var terrain: Terrain
var effects: Effects
var weapons = null                # Weapons
var input := {"pitch": 0.0, "roll": 0.0, "yaw": 0.0, "throttle": 0.0,
		"ab": false, "gear": true, "flaps": 0.0, "brake": false, "fire": false}

var gun_ammo := 500
var msl_stations: Array = []      # [{name, type, left}]
var bombs := 0
var rockets := 0
var flares := 48
var chaff := 60
var lock_target: Aircraft = null
var lock_t := 0.0
var alive := true
var spawn_protect := 3.0
var hp_max := 100.0

var refs: Dictionary
var _visual: Node3D
var _smoke_t := 0.0
var _disp := {"pitch": 0.0, "roll": 0.0, "yaw": 0.0, "gear": 1.0, "flame_t": 0.0}
var _gun_cd := 0.0
var _msl_cd := 0.0
var _wreck_t := 0.0

func setup(spec_dict: Dictionary, team_: String, player: bool, name_: String, terr: Terrain, fx: Effects) -> void:
	spec = spec_dict
	team = team_
	is_player = player
	display_name = name_
	terrain = terr
	effects = fx
	st = FlightModelG.new_state(spec)
	hp_max = float(spec.get("hp", 100))
	gun_ammo = int(spec.get("guns", [{}])[0].get("ammo", 300))
	for m in spec.get("missiles", []):
		msl_stations.append({"name": m.get("name", "MSL"), "type": m.get("type", "ir"),
				"range": float(m.get("range", 8000)), "count": int(m.get("count", 2)),
				"left": int(m.get("count", 2))})
	bombs = int(spec.get("bombs", 0))
	rockets = int(spec.get("rockets", 0))
	flares = int(spec.get("flares", 48))
	chaff = int(spec.get("chaff", 60))
	var built: Dictionary = JetBuilderG.build(spec)
	_visual = built.node
	refs = built.refs
	add_child(_visual)

func spawn_air(alt: float, heading_deg: float, x: float, z: float) -> void:
	st.pos = Vector3(x, terrain.ground_height(x, z) + alt, z)
	st.quat = Quaternion(Vector3.UP, heading_deg * PI / 180.0)
	st.vel = (st.quat * Vector3.FORWARD) * 250.0
	st.fuel = float(spec.get("fuelCap", 2000))
	st.alive = true
	alive = true
	st.gear = false
	st.thr = 0.75
	input.throttle = 0.75
	spawn_protect = 3.0
	st.thr = 0.75
	st.hp = hp_max
	gun_ammo = int(spec.get("guns", [{}])[0].get("ammo", 300))
	for msl in msl_stations:
		msl.left = int(msl.count)
	visible = true

func _physics_process(dt: float) -> void:
	if not alive:
		_wreck_t -= dt
		return
	spawn_protect = maxf(0.0, spawn_protect - dt)
	_gun_cd = maxf(0.0, _gun_cd - dt)
	_msl_cd = maxf(0.0, _msl_cd - dt)
	# ارتفاع زمین زیر هواپیما
	spec["_ground_y"] = terrain.ground_height(st.pos.x, st.pos.z)
	if ai != null:
		ai.update(dt, self)
	FlightModelG.step(st, spec, input, dt)
	# همگام‌سازی نود
	global_position = st.pos
	global_basis = Basis(st.quat)
	_animate(dt)
	_damage_fx(dt)
	if input.fire and _gun_cd <= 0.0 and gun_ammo > 0:
		_fire_gun(dt)
	if lock_target != null and (not is_instance_valid(lock_target) or not lock_target.alive):
		lock_target = null
		lock_t = 0.0

func _animate(dt: float) -> void:
	var k := 1.0 - exp(-dt * 9.0)
	_disp.pitch += (clampf(input.pitch, -1, 1) - _disp.pitch) * k
	_disp.roll += (clampf(input.roll, -1, 1) - _disp.roll) * k
	_disp.yaw += (clampf(input.yaw, -1, 1) - _disp.yaw) * k
	for p in refs.get("elev", []):
		p.rotation.x = _disp.pitch * 0.5
	for a in refs.get("ail", []):
		a.rotation.x = _disp.roll * 0.45
	for r in refs.get("rud", []):
		r.rotation.y = _disp.yaw * 0.28
	for f in refs.get("flap", []):
		f.rotation.x = -st.flaps * 0.55
	# چرخ فرود
	var gear_t := 1.0 if st.gear else 0.0
	_disp.gear += (gear_t - _disp.gear) * (1.0 - exp(-dt * 1.8))
	for g in refs.get("gear", []):
		g.rotation.x = (1.0 - _disp.gear) * 1.5
		# بالای سطح زمین بسته باشد
	# شعله AB
	var ab_on: bool = st.ab and st.fuel > 0.0
	for fl in refs.get("flames", []):
		fl.visible = ab_on
		if ab_on:
			var f2 := randf_range(0.85, 1.15)
			fl.scale = Vector3(f2, 0.8 + randf_range(0.0, 0.5) + st.mach * 0.2, f2)

func _damage_fx(dt: float) -> void:
	if st.hp < hp_max * 0.3:
		st.engine_fire = true
		_smoke_t -= dt
		if _smoke_t <= 0.0:
			_smoke_t = 0.07
			var back := global_basis * Vector3.BACK
			effects.smoke_plume(global_position + back * 6.0 * (spec.get("len", 15.0) / 15.0), 0.5, 1.6)
	elif st.hp < hp_max * 0.5:
		_smoke_t -= dt
		if _smoke_t <= 0.0:
			_smoke_t = 0.12
			var back2 := global_basis * Vector3.BACK
			effects.smoke_plume(global_position + back2 * 6.0, 0.35, 1.2)

func _fire_gun(dt: float) -> void:
	_gun_cd = 60.0 / float(spec.get("guns", [{}])[0].get("rpm", 3000))
	gun_ammo -= 1
	var muzzle := global_position + global_basis * Vector3(0, -0.8, -6.0)
	var dir := -global_basis.z
	if weapons != null:
		weapons.fire_bullet(muzzle, dir, self)

# ---------- تسلیحات ----------
func fire_missile() -> bool:
	if _msl_cd > 0.0 or weapons == null:
		return false
	var station = null
	if lock_target != null and lock_t > 0.9:
		for s in msl_stations:
			if s.left > 0:
				station = s
				break
	if station == null:
		return false
	_msl_cd = 1.4
	station.left -= 1
	var spawn := global_position + global_basis * Vector3(0, -1.7, -2.0)
	weapons.launch_missile(spawn, st.vel, lock_target, self, station.type, station.range)
	return true

func drop_flares() -> void:
	if flares < 8:
		return
	flares -= 8
	if weapons != null:
		weapons.drop_flares(global_position + global_basis * Vector3(0, -1.5, 0), st.vel)
	if chaff >= 4:
		chaff -= 4
		if weapons != null:
			weapons.drop_chaff(global_position + global_basis * Vector3(0, -1.5, 0), st.vel)

# ---------- آسیب ----------
func take_hit(dmg: float, attacker: Aircraft) -> void:
	if not alive or spawn_protect > 0.0 and attacker != self:
		return
	st.hp -= dmg
	lock_break_chance(dmg)
	if st.hp <= 0.0:
		_die(attacker)

func lock_break_chance(_dmg: float) -> void:
	pass

func _die(killer: Aircraft) -> void:
	alive = false
	st.alive = false
	visible = false
	effects.explosion(global_position, 2.2)
	died.emit(self, killer)

func speed_kmh() -> float:
	return st.V * 3.6
