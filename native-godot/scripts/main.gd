extends Node3D
## AIRDOM — مغز بازی: دنیا، موج دشمنان، وضعیت‌ها، تست خودکار

var terrain: AirdomTerrain
var player: PlayerJet
var bullets: BulletPool
var missiles: MissileManager
var fx: Fx
var audio: GameAudio
var hud: AirdomHud

var enemies: Array = []
var wave := 0
var kills := 0
var state := "flying"   # flying / paused / dead
var _wave_timer := 0.0
var _next_wave_pending := false

# تست خودکار: godot --path . -- autotest
var _autotest := false
var _shots := []
var _t := 0.0

const GREEN := Color(0.62, 1.0, 0.69)
const RED := Color(1.0, 0.35, 0.35)

func _ready() -> void:
	_autotest = "autotest" in OS.get_cmdline_user_args()
	process_mode = Node.PROCESS_MODE_ALWAYS

	# ---------- دنیا ----------
	var we := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sm := ProceduralSkyMaterial.new()
	sm.sky_top_color = Color(0.16, 0.36, 0.62)
	sm.sky_horizon_color = Color(0.78, 0.74, 0.64)
	sm.ground_bottom_color = Color(0.30, 0.26, 0.20)
	sm.ground_horizon_color = Color(0.76, 0.69, 0.55)
	sm.sun_angle_max = 30.0
	sm.sun_curve = 0.10
	sky.sky_material = sm
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.glow_enabled = true
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_light_color = Color(0.76, 0.70, 0.58)
	env.fog_depth_begin = 2500.0
	env.fog_depth_end = 20000.0
	env.fog_sky_affect = 0.12
	we.environment = env
	add_child(we)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-34, -128, 0)
	sun.light_energy = 1.3
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 900.0
	add_child(sun)

	terrain = AirdomTerrain.new()
	add_child(terrain)

	fx = Fx.new()
	add_child(fx)
	bullets = BulletPool.new()
	add_child(bullets)
	missiles = MissileManager.new()
	add_child(missiles)
	audio = GameAudio.new()
	add_child(audio)
	fx.audio = audio
	missiles.audio = audio

	player = PlayerJet.new()
	player.terrain = terrain
	add_child(player)
	player.audio = audio
	player.bullets = bullets
	player.missiles = missiles

	hud = AirdomHud.new()
	add_child(hud)
	hud.main = self
	hud.player = player
	player.hud = hud

	bullets.player = player
	bullets.fx = fx
	missiles.player = player
	bullets.enemy_hit.connect(_on_enemy_shot)
	bullets.player_hit.connect(func(): player.take_hit())
	player.crashed.connect(_on_crashed)
	missiles.enemy_killed.connect(_on_enemy_killed)

	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	player.spawn_air(1500.0, 90.0)
	_spawn_wave()

	_build_overlays()

# ---------- موج دشمنان ----------
func _spawn_wave() -> void:
	wave += 1
	var n := 2 + wave
	for i in n:
		var e := EnemyJet.new()
		e.player = player
		e.terrain = terrain
		e.bullets = bullets
		e.missiles = missiles
		add_child(e)
		var ang := TAU * float(i) / float(n)
		var pos := Vector3(3800 + cos(ang) * 900.0, randf_range(1300, 1900), 600 + sin(ang) * 900.0)
		e.setup(pos, 270.0, randf_range(190, 240))
		enemies.append(e)
	hud.banner("موج %d — %d جت دشمن پدیدار شد" % [wave, n])

func _on_enemy_shot(e) -> void:
	if e is EnemyJet:
		e.take_hit()
		if not e.alive:
			_on_enemy_killed(e)

func _on_enemy_killed(e: Node3D) -> void:
	if not is_instance_valid(e):
		return
	kills += 1
	fx.explosion(e.global_position, 1.4)
	hud.banner("سرنگون شد! (%d)" % kills)

func _process(dt: float) -> void:
	enemies = enemies.filter(func(e): return is_instance_valid(e) and e.alive)
	bullets.enemies = enemies
	missiles.enemies = enemies
	if _next_wave_pending and state == "flying":
		_wave_timer -= dt
		if _wave_timer <= 0.0:
			_next_wave_pending = false
			_spawn_wave()
	elif enemies.is_empty() and not _next_wave_pending and state == "flying":
		_next_wave_pending = true
		_wave_timer = 8.0
		hud.banner("همه دشمنان سرنگون شدند — موج بعدی تا ۸ ثانیه…")

	if _autotest:
		_autotest_step(dt)

# ---------- تست خودکار (بدون ورودی انسانی) ----------
func _autotest_step(dt: float) -> void:
	_t += dt
	if player != null and player.st.alive:
		player.st.throttle = 1.0
		player.st.ab = _t > 2.0
		# فاز نبرد: نشانه‌گیری به نزدیک‌ترین دشمن و شلیک
		if _t > 3.0 and not enemies.is_empty():
			var e: Node3D = enemies[0]
			for en in enemies:
				if en.global_position.distance_to(player.global_position) < e.global_position.distance_to(player.global_position):
					e = en
			var dir: Vector3 = (e.global_position - player.global_position).normalized()
			var want := Basis.looking_at(dir, Vector3.UP)
			player.st.basis = player.st.basis.slerp(want, minf(1.0, 6.0 * dt)).orthonormalized()
			player._weapons(dt, {"fire": true})
			if _t > 5.0 and player.lock_progress() >= 1.0 and player.missiles_left() == 4:
				player._fire_missile()
		if _t > 0.5 and _t < 2.5:
			player.st.ang.z = -0.6   # غلت نمایشی
		else:
			player.st.ang.z = 0.0
	for mark in [2.0, 5.0, 8.0]:
		if _t >= mark and not mark in _shots:
			_shots.append(mark)
			var img := get_viewport().get_texture().get_image()
			var dir := ProjectSettings.globalize_path("res://") + "shots"
			DirAccess.make_dir_recursive_absolute(dir)
			img.save_png("%s/shot_%d.png" % [dir, int(mark)])
			print("AUTOTEST t=%.1f pos=%s v=%.0f" % [_t, str(player.st.pos.round()), player.st.v])
	if _t > 14.0:
		print("AUTOTEST done, kills=", kills, " enemies=", enemies.size())
		get_tree().quit()

# ---------- ورودی سراسری ----------
func _unhandled_input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and not e.echo:
		match e.keycode:
			KEY_ESCAPE:
				if state == "flying":
					_set_paused(true)
				elif state == "paused":
					_set_paused(false)
			KEY_R:
				if state == "dead" or state == "paused":
					get_tree().reload_current_scene()

func _set_paused(p: bool) -> void:
	state = "paused" if p else "flying"
	get_tree().paused = p
	_pause_layer.visible = p
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if p else Input.MOUSE_MODE_CAPTURED

func _on_crashed(reason: String) -> void:
	if state == "dead":
		return
	state = "dead"
	fx.explosion(player.st.pos, 2.0)
	get_tree().paused = false
	_dead_reason.text = reason
	_dead_layer.visible = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	hud.banner("")

# ---------- لایه‌های توقف/باخت ----------
var _pause_layer: CanvasLayer
var _dead_layer: CanvasLayer
var _dead_reason: Label

func _build_overlays() -> void:
	_pause_layer = CanvasLayer.new()
	_pause_layer.process_mode = Node.PROCESS_MODE_ALWAYS
	_pause_layer.layer = 5
	_pause_layer.visible = false
	var pv := VBoxContainer.new()
	pv.add_theme_constant_override("separation", 10)
	pv.add_child(_vlabel("توقف", 34, GREEN))
	pv.add_child(_vlabel("Esc ادامه   |   R شروع دوباره", 17, Color(0.8, 0.85, 0.9)))
	pv.add_child(_vlabel("↑↓ پیچ   A/D غلت   Q/E دُم   W/S گاز   Z افتربرنر", 15, Color(0.7, 0.8, 0.9)))
	pv.add_child(_vlabel("G چرخ   V فلپ   X ترمز   Space توپ   F موشک   C فلر   1/2/3 دوربین", 15, Color(0.7, 0.8, 0.9)))
	_pause_layer.add_child(_centered(pv))
	add_child(_pause_layer)

	_dead_layer = CanvasLayer.new()
	_dead_layer.process_mode = Node.PROCESS_MODE_ALWAYS
	_dead_layer.layer = 5
	_dead_layer.visible = false
	var dv := VBoxContainer.new()
	dv.add_theme_constant_override("separation", 12)
	dv.add_child(_vlabel("مأموریت پایان یافت", 32, RED))
	_dead_reason = _vlabel("", 17, Color(1.0, 0.75, 0.7))
	dv.add_child(_dead_reason)
	dv.add_child(_vlabel("R پرواز دوباره", 19, GREEN))
	_dead_layer.add_child(_centered(dv))
	add_child(_dead_layer)

func _centered(v: VBoxContainer) -> Control:
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.03, 0.05, 0.72)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	var cc := CenterContainer.new()
	cc.set_anchors_preset(Control.PRESET_FULL_RECT)
	cc.add_child(v)
	dim.add_child(cc)
	return dim

func _vlabel(txt: String, size: int, col: Color) -> Label:
	var l := Label.new()
	l.text = txt
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	l.add_theme_constant_override("outline_size", 5)
	return l
