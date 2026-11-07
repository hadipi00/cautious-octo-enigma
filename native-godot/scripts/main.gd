# ============================================================
# main.gd — مغز بازی: آشیانه → انتخاب جت → مأموریت → نتیجه → آشیانه
# مأموریت‌ها: برتری هوایی، بی‌آر، حمله به بیس، تیمی، آزاد
# دوربین: کابین / تعقیب / دور — با نگاه آزاد Ctrl
# ============================================================
extends Node

const AircraftG = preload("res://scripts/planes/aircraft.gd")
const AIPilotG = preload("res://scripts/combat/ai_pilot.gd")
const TerrainG = preload("res://scripts/world/terrain.gd")
const SkyEnvG = preload("res://scripts/world/skyenv.gd")
const EffectsG = preload("res://scripts/combat/effects.gd")
const WeaponsG = preload("res://scripts/combat/weapons.gd")
const GroundDefenseG = preload("res://scripts/combat/ground_defense.gd")
const ControlsG = preload("res://scripts/ui/controls.gd")
const HUDG = preload("res://scripts/ui/hud.gd")
const HangarSceneG = preload("res://scripts/world/hangar_scene.gd")
const HangarUIG = preload("res://scripts/ui/hangar_ui.gd")
const CockpitG = preload("res://scripts/ui/cockpit.gd")
const GameAudioG = preload("res://scripts/audio.gd")
const TerrainHelperG = preload("res://scripts/combat/weapons.gd").TerrainHelper

const PLANE_IDS := [
	"mig15bis", "f5e", "f104s", "mig21bis",
	"f4e", "mig23ml", "miragef1", "tornado", "su24m",
	"a10a", "su25",
	"f14b", "f15c", "f16c", "fa18c", "mig29a", "mirage2000c", "su27s", "su30sm",
	"jas39c", "rafale", "typhoon",
	"f22a", "mig31bm",
]

enum State { LOADING, HANGAR, FLIGHT, PAUSED, RESULTS }

var state: int = State.LOADING
var specs: Dictionary = {}
var plane_idx := 10
var mission_type := "air"
var score := 0
var kills := 0
var wave := 0
var best := 0
var next_wave_t := 0.0

var flight_world: Node3D
var terrain: Terrain
var sky: SkyEnv
var effects: Effects
var weapons: Weapons
var ground_defense: GroundDefense
var hangar: HangarScene
var camera: Camera3D
var cockpit: Cockpit
var controls: ControlsG
var hud: HUDG
var hangar_ui: HangarUIG
var audio: GameAudioG

var aircraft: Array = []
var player: Aircraft = null
var cam_mode := 1
var _cam_pos := Vector3.ZERO
var _cam_aim := Vector3.ZERO

var _strike_targets: Array = []
var _strike_left := 0
var _autotest := false
var _autotest_t := 0.0
var _tp_done := false

func _ready() -> void:
	best = int(UserDefaults.load_var("best", 0))
	_build_all()
	_load_specs()
	if OS.get_cmdline_user_args().has("--autotest"):
		_autotest = true
		start_mission("air")

func _build_all() -> void:
	flight_world = Node3D.new()
	flight_world.name = "FlightWorld"
	add_child(flight_world)

	terrain = TerrainG.new()
	add_child(terrain)
	terrain.build(flight_world)

	sky = SkyEnvG.new()
	sky.build(flight_world)

	effects = EffectsG.new(flight_world)

	weapons = WeaponsG.new()
	weapons.effects = effects
	weapons.game = self
	flight_world.add_child(weapons)

	ground_defense = GroundDefenseG.new(terrain, effects, weapons)
	ground_defense.game = self

	hangar = HangarSceneG.new()
	add_child(hangar)

	camera = Camera3D.new()
	camera.fov = 70.0
	camera.near = 0.3
	camera.far = 45000.0
	add_child(camera)
	camera.current = true
	camera.position = Vector3(20, 12, 22)
	camera.look_at(Vector3.ZERO)

	cockpit = CockpitG.new()
	cockpit.main = self
	camera.add_child(cockpit)
	cockpit.visible = false

	controls = ControlsG.new()
	add_child(controls)
	controls.setup(self, camera)

	hud = HUDG.new()
	hud.main = self
	add_child(hud)

	audio = GameAudioG.new()
	add_child(audio)

	TerrainHelperG.ground_fn = Callable(terrain, "ground_height")

	hangar_ui = HangarUIG.new()
	add_child(hangar_ui)
	hangar_ui.battle_selected.connect(_on_battle_selected)
	hangar_ui.plane_changed.connect(_on_plane_changed)
	hangar_ui.settings_changed.connect(_on_quality_changed)

func _load_specs() -> void:
	var total := PLANE_IDS.size()
	var done := 0
	for id in PLANE_IDS:
		var f := FileAccess.open("res://assets/specs/%s.json" % id, FileAccess.READ)
		if f != null:
			var parsed = JSON.parse_string(f.get_as_text())
			if parsed is Dictionary:
				specs[id] = parsed
		done += 1
		hangar_ui.set_loading(float(done) / total)
	_refresh_hangar_jet()
	hangar_ui.hide_loading()
	hangar_ui.show_hangar_ui()
	state = State.HANGAR

func _refresh_hangar_jet() -> void:
	var id: String = PLANE_IDS[plane_idx]
	var spec: Dictionary = specs.get(id, {})
	hangar.set_jet(spec)
	hangar_ui.set_jet_card(spec, plane_idx, PLANE_IDS.size())

func _on_plane_changed(delta: int) -> void:
	plane_idx = wrapi(plane_idx + delta, 0, PLANE_IDS.size())
	audio.ui_click()
	_refresh_hangar_jet()

func _on_quality_changed(q: String) -> void:
	UserDefaults.save_var("quality", q)
	apply_quality(q)

func apply_quality(q: String) -> void:
	var vp := get_viewport()
	if q == "low":
		vp.scaling_3d_scale = 0.7
		vp.msaa_3d = Viewport.MSAA_DISABLED
	elif q == "medium":
		vp.scaling_3d_scale = 0.85
		vp.msaa_3d = Viewport.MSAA_2X
	elif q == "high":
		vp.scaling_3d_scale = 1.0
		vp.msaa_3d = Viewport.MSAA_4X
	else:
		vp.scaling_3d_scale = 2.0
		vp.msaa_3d = Viewport.MSAA_4X

# ---------- انتخاب نبرد ----------
func _on_battle_selected(kind: String) -> void:
	if kind == "__again__":
		start_mission(mission_type)
		return
	if kind == "__hangar__":
		to_hangar()
		return
	start_mission(kind)

# ---------- مأموریت ----------
func start_mission(kind: String) -> void:
	mission_type = kind
	for ac in aircraft:
		if is_instance_valid(ac):
			ac.queue_free()
	aircraft.clear()
	player = null
	score = 0
	kills = 0
	wave = 0
	next_wave_t = 0.0
	ground_defense.enabled = (kind == "strike")
	_strike_targets.clear()
	_strike_left = 0
	if kind == "strike":
		for i in 4:
			var ox: float = -130 + (i % 2) * 90
			var oz: float = -700 + floorf(i / 2.0) * 320
			_strike_targets.append({"pos": Vector3(Terrain.ENEMY.x + ox, Terrain.ENEMY.y + 7.5, Terrain.ENEMY.z + oz), "hp": 70.0, "alive": true})
		_strike_left = 4

	var plane_id: String = PLANE_IDS[plane_idx]
	var spec: Dictionary = specs.get(plane_id, specs.values()[0])
	weapons.aircraft_list = aircraft
	weapons.game = self
	player = AircraftG.new()
	player.setup(spec, "blue", true, "خلبان", terrain, effects)
	player.weapons = weapons
	player.died.connect(_on_aircraft_died)
	flight_world.add_child(player)
	aircraft.append(player)
	controls.reset()

	match kind:
		"free":
			player.spawn_air(1400, 0, -2000, -2000)
			hud.banner("پرواز آزاد — باند فرود در غرب نقشه")
		"strike":
			player.spawn_air(1200, 0, -2800, 800)
			_spawn_wave(1)
			hud.banner("حمله به بیس دشمن! مواظب SAM باش")
		"team":
			player.spawn_air(1500, 0, -2400, -400)
			_spawn_ally(2)
			_spawn_wave(2)
			hud.banner("نبرد تیمی — با متحدانت در حالتن")
		"bvr":
			player.spawn_air(1500, 0, -2600, 0)
			_spawn_bvr(4)
			hud.banner("نبرد فراتر از دید — با N قفل کن و F شلیک کن", 6.0)
		_:
			player.spawn_air(1500, 0, -2400, 0)
			_spawn_wave(1)
			hud.banner("برتری هوایی — موج اول در راه است")

	state = State.FLIGHT
	_cam_pos = Vector3.ZERO
	_cam_aim = Vector3.ZERO
	hangar_ui.hide_hangar_ui()
	hud.visible = true
	controls.capture()
	set_cam_mode(0)

func _spawn_wave(n: int) -> void:
	wave = n if n > 0 else wave + 1
	var count := mini(2 + wave, 6)
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var ids: Array = specs.keys()
	for i in count:
		var ang := float(i) / count * PI * 1.2 + PI * 0.9
		var pos := Vector3(Terrain.ENEMY.x + cos(ang) * 1100.0, rng.randf_range(1300, 2400), Terrain.ENEMY.z + sin(ang) * 1100.0)
		var id: String = ids[rng.randi() % ids.size()]
		_make_enemy(id, pos, 250.0, minf(1.2, 0.65 + wave * 0.09 + rng.randf() * 0.15))
	hud.banner("موج %d — %d جت دشمن وارد شد" % [wave, count])

func _make_enemy(id: String, pos: Vector3, heading: float, skill: float) -> void:
	var spec: Dictionary = specs.get(id, {})
	var ac := AircraftG.new()
	ac.setup(spec, "red", false, str(spec.get("name", "دشمن")), terrain, effects)
	ac.weapons = weapons
	ac.died.connect(_on_aircraft_died)
	flight_world.add_child(ac)
	ac.spawn_air(pos.y - terrain.ground_height(pos.x, pos.z), heading, pos.x, pos.z)
	ac.ai = AIPilotG.new(skill, self)
	if _autotest:
		ac.ai.passive = true
	aircraft.append(ac)

func _spawn_ally(n: int) -> void:
	var ids: Array = specs.keys()
	for i in n:
		var id: String = ids[i % ids.size()]
		var spec: Dictionary = specs.get(id, {})
		var ac := AircraftG.new()
		ac.setup(spec, "blue", false, "متحد %d" % (i + 1), terrain, effects)
		ac.weapons = weapons
		ac.died.connect(_on_aircraft_died)
		flight_world.add_child(ac)
		ac.spawn_air(1400 + i * 250, 90, -2200 + i * 400, 200)
		ac.ai = AIPilotG.new(0.9, self)
		aircraft.append(ac)

func _spawn_bvr(n: int) -> void:
	wave = 1
	var roster: Array = []
	for k in specs:
		var s: Dictionary = specs[k]
		var has_radar_msl: bool = false
		for m in s.get("missiles", []):
			if m.get("type", "ir") != "ir":
				has_radar_msl = true
		if s.has("radar") and has_radar_msl:
			roster.append(k)
	if roster.is_empty():
		roster = specs.keys()
	for i in n:
		var pos := Vector3((i - (n - 1) / 2.0) * 1800.0, 3400 + randf() * 1400.0, player.st.pos.z + 21000.0 + randf() * 5000.0)
		_make_enemy(str(roster[randi() % roster.size()]), pos, 180.0, 0.95 + randf() * 0.2)

# ---------- رویداد مرگ ----------
func _on_aircraft_died(ac: Aircraft, killer) -> void:
	audio.explosion(1.0)
	if ac == player:
		_end_mission(false, "سرنگون شدی")
		return
	if ac.team == "red":
		kills += 1
		score += 100
		if killer == player:
			hud.kill_feed("جت دشمن سرنگون شد +۱۰۰")
			hud.flash_hit()
			audio.lock_beep()
		else:
			hud.kill_feed("متحدت یک دشمن را زد")
	else:
		hud.kill_feed("متحد سرنگون شد")

func _end_mission(win: bool, reason: String) -> void:
	if state == State.RESULTS:
		return
	state = State.RESULTS
	best = maxi(best, score)
	UserDefaults.save_var("best", best)
	controls.release()
	hud.visible = false
	hangar_ui.show_results(win, reason, score, kills, wave, best)

func to_hangar() -> void:
	state = State.HANGAR
	for ac in aircraft:
		if is_instance_valid(ac):
			ac.queue_free()
	aircraft.clear()
	player = null
	hud.visible = false
	controls.release()
	controls.reset()
	_refresh_hangar_jet()
	hangar_ui.show_hangar_ui()

func resume_flight() -> void:
	if state == State.PAUSED:
		state = State.FLIGHT
		hangar_ui.hide_pause()
		controls.capture()

func on_escape() -> void:
	if state == State.FLIGHT:
		state = State.PAUSED
		controls.release()
		hangar_ui.show_pause()
	elif state == State.PAUSED:
		resume_flight()

# ---------- اکشن‌های بازیکن ----------
func player_action(action: String) -> void:
	if player == null or not player.alive:
		return
	match action:
		"missile":
			if not player.fire_missile():
				hud.banner("قفل فعال نیست یا موشک نداری")
		"bomb":
			weapons.drop_bomb(player.global_position + player.global_basis * Vector3(0, -1.9, -1.0), player.st.vel, player)
		"rocket":
			for i in 6:
				var dir := (-player.global_basis.z + Vector3(randf_range(-0.02, 0.02), randf_range(-0.02, 0.02), 0)).normalized()
				var bpos := player.global_position + player.global_basis * Vector3(0, -1.2, -5.0)
				weapons.fire_bullet(bpos, dir, player)
		"flares":
			player.drop_flares()
		"radar":
			_lock_nearest()

func _lock_nearest() -> void:
	var best_ac: Aircraft = null
	var best_score := -1e12
	for ac in aircraft:
		if ac == player or not ac.alive or ac.team != "red":
			continue
		var to_ac: Vector3 = ac.global_position - player.global_position
		var d := to_ac.length()
		if d > 14000:
			continue
		var fwd: Vector3 = -player.global_basis.z
		var dot: float = fwd.dot(to_ac.normalized())
		if dot < 0.55:
			continue
		var sc := dot * 2.0 - d / 14000.0
		if sc > best_score:
			best_score = sc
			best_ac = ac
	if best_ac != null:
		player.lock_target = best_ac
		player.lock_t = 1.5
		audio.lock_beep()
		hud.banner("قفل: " + best_ac.display_name)
	else:
		hud.banner("هدفی در کون قفل نیست")
	player._msl_cd = 0.0

func set_cam_mode(m: int) -> void:
	cam_mode = m
	cockpit.visible = (m == 0)
	if m == 0:
		camera.near = 0.05
	else:
		camera.near = 0.3

# ---------- حلقه اصلی ----------
func _physics_process(dt: float) -> void:
	if _autotest:
		_autotest_tick(dt)
	if state == State.FLIGHT:
		_update_flight(dt)
	elif state == State.HANGAR:
		hangar.update_cam(dt, camera)

func _update_flight(dt: float) -> void:
	if player == null:
		return
	if player.ai == null:
		# فقط وقتی خلبان انسانی (هوش مصنوعی ندارد) ورودی موس اعمال شود
		var inp: Dictionary = controls.build_input(player, dt)
		for k in inp:
			player.input[k] = inp[k]
	ground_defense.update(dt, aircraft)
	_auto_lock(dt)
	var red_alive := 0
	for ac in aircraft:
		if ac.alive and ac.team == "red":
			red_alive += 1
	if red_alive == 0 and (mission_type == "air" or mission_type == "team"):
		if next_wave_t <= 0.0:
			next_wave_t = 6.0
			hud.banner("موج پاکسازی شد — موج بعدی تا ۶ ثانیه…")
	if next_wave_t > 0.0:
		next_wave_t -= dt
		if next_wave_t <= 0.0:
			_spawn_wave(0)
	if mission_type == "bvr" and red_alive == 0:
		_end_mission(true, "همه دشمنان بی‌آر سرنگون شدند!")
	_update_camera(dt)
	if cam_mode == 0:
		cockpit.update_from(dt, player, self)
	audio.set_engine(player.st, true)
	effects.process(dt)
	sky.update(camera, dt)

func _autotest_tick(dt: float) -> void:
	_autotest_t += dt
	if player != null and player.alive:
		player.spawn_protect = 5.0
		if state != State.FLIGHT:
			start_mission("air")
		# خلبان خودکار = همان هوش مصنوعی بازی — تست دوطرفه
		if player.ai == null:
			player.ai = AIPilotG.new(1.0, self)
		# در ثانیه ۴۰: تلپورت پشت نزدیک‌ترین دشمن — تست زنجیره کشتن
		if _autotest_t >= 15.0 and _autotest_t < 15.5 and not _tp_done:
			_tp_done = true
			var tgt: Aircraft = null
			var bd2 := 1e12
			for ac2 in aircraft:
				if ac2.alive and ac2.team == "red":
					var dd3: float = ac2.global_position.distance_to(player.global_position)
					if dd3 < bd2:
						bd2 = dd3
						tgt = ac2
			if tgt != null:
				var behind: Vector3 = tgt.global_position - tgt.global_basis * Vector3(0, 0, 60) + Vector3(0, 30, 0)
				player.st.pos = behind
				player.st.vel = tgt.st.vel * 1.05
				player.st.quat = tgt.st.quat
				print("[AUTOTEST] teleport behind enemy for kill-chain test")
	var vv: float = player.st.V if player != null else 0.0
	var nd := -1.0
	if player != null:
		for ac in aircraft:
			if ac.alive and ac.team == "red":
				var dd2: float = ac.global_position.distance_to(player.global_position)
				if nd < 0.0 or dd2 < nd:
					nd = dd2
	var reds := 0
	for ac in aircraft:
		if ac.alive and ac.team == "red":
			reds += 1
	if fmod(_autotest_t, 5.0) < dt:
		print("[AUTOTEST] t=%.0f V=%.0f alt=%.0f kills=%d enemies=%d ndist=%.0f" % [
			_autotest_t, vv, player.st.pos.y if player != null else 0.0, kills, reds, nd])
	if _autotest_t > 45.0:
		print("[AUTOTEST-DONE] kills=%d score=%d" % [kills, score])
		get_tree().quit(0)

func _auto_lock(dt: float) -> void:
	if player.lock_target != null and is_instance_valid(player.lock_target) and player.lock_target.alive:
		player.lock_t += dt
		return
	var best_ac: Aircraft = null
	var bd := 5000.0
	var fwd: Vector3 = -player.global_basis.z
	for ac in aircraft:
		if ac == player or not ac.alive or ac.team != "red":
			continue
		var to_ac: Vector3 = ac.global_position - player.global_position
		var d := to_ac.length()
		if d < bd and fwd.dot(to_ac.normalized()) > 0.94:
			bd = d
			best_ac = ac
	if best_ac != null:
		if player.lock_target != best_ac:
			player.lock_t = 0.0
		player.lock_target = best_ac
		player.lock_t = minf(player.lock_t + dt, 2.0)
	else:
		player.lock_target = null
		player.lock_t = 0.0

func _update_camera(dt: float) -> void:
	var st: Dictionary = player.st
	var look: Vector2 = controls.look
	if Time.get_ticks_msec() - controls.last_move_ms > 1600:
		look = look.lerp(Vector2.ZERO, minf(1.0, dt * 4.0))
		controls.look = look
	var shake: float = (0.25 if st.stalled else 0.0) + maxf(0.0, st.g_force - 6.5) * 0.05
	if cam_mode == 0:
		var head := Vector3(0, 0.85, 1.2)
		camera.global_position = player.global_position + (player.global_basis * head)
		var look_q := Quaternion(Vector3.UP, look.x) * Quaternion(Vector3.RIGHT, look.y)
		camera.global_basis = player.global_basis * Basis(look_q)
	else:
		var back := 17.0 if cam_mode == 1 else 34.0
		var up := 4.6 if cam_mode == 1 else 9.0
		var target_pos: Vector3 = player.global_position + player.global_basis * Vector3(0, up, back)
		if _cam_pos == Vector3.ZERO:
			_cam_pos = target_pos
		_cam_pos = _cam_pos.lerp(target_pos, minf(1.0, dt * 6.5))
		camera.global_position = _cam_pos
		var aim := player.global_position + player.global_basis * Vector3(0, 0, -45)
		if _cam_aim == Vector3.ZERO:
			_cam_aim = aim
		_cam_aim = _cam_aim.lerp(aim, minf(1.0, dt * 6.5))
		camera.look_at(_cam_aim)
	if shake > 0.01:
		camera.global_position += Vector3(randf_range(-1, 1), randf_range(-1, 1), randf_range(-1, 1)) * shake
	var base_fov := 76.0 if cam_mode == 0 else 70.0
	var target_fov := base_fov + clampf((st.V - 260.0) / 780.0, 0.0, 1.0) * 9.0 + (2.5 if st.ab else 0.0)
	camera.fov = lerpf(camera.fov, target_fov, minf(1.0, dt * 4.5))

func on_bomb_impact(pos: Vector3, owner) -> void:
	for t in _strike_targets:
		if not t.alive:
			continue
		if pos.distance_to(t.pos) < 55.0:
			t.hp -= 140.0
			if t.hp <= 0.0:
				t.alive = false
				effects.explosion(t.pos, 2.4)
				score += 100
				hud.kill_feed("هدف زمینی نابود شد +۱۰۰")
				_strike_left -= 1
				if _strike_left <= 0 and mission_type == "strike":
					_end_mission(true, "بیس دشمن به‌طور کامل نابود شد!")
			else:
				effects.explosion(pos, 1.2)
			break
