# ============================================================
# skyenv.gd — آسمان/نور/محیط: ProceduralSky + ACES + glow + مه
# خورشید HDR + ابرهای پفکی + نور جهت‌دار سایه‌دار
# ============================================================
class_name SkyEnv

static var SUN_DIR := Vector3(-0.42, 0.58, 0.40).normalized()

var sun: DirectionalLight3D
var env: Environment
var clouds_root: Node3D
var _cloud_sprites: Array = []
var flare: Sprite3D

func build(root: Node3D) -> void:
	# ---------- آسمان ----------
	var sky := Sky.new()
	var mat := ProceduralSkyMaterial.new()
	mat.sky_top_color = Color(0.075, 0.21, 0.52)
	mat.sky_horizon_color = Color(0.82, 0.77, 0.66)
	mat.sky_curve = 0.12
	mat.ground_bottom_color = Color(0.38, 0.34, 0.28)
	mat.ground_horizon_color = Color(0.80, 0.75, 0.64)
	mat.sun_angle_max = 30.0
	mat.sun_curve = 0.08
	mat.energy_multiplier = 1.0
	sky.sky_material = mat
	sky.radiance_size = Sky.RADIANCE_SIZE_256

	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_sky_contribution = 1.0
	env.ambient_light_energy = 1.0
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.06
	env.glow_enabled = true
	env.glow_intensity = 0.5
	env.glow_bloom = 0.06
	env.glow_hdr_threshold = 1.1
	env.fog_enabled = true
	env.fog_light_color = Color(0.78, 0.73, 0.63)
	env.fog_density = 0.00006
	env.fog_sky_affect = 0.0
	env.fog_height = 120.0
	env.fog_height_density = 0.00012

	var we := WorldEnvironment.new()
	we.environment = env
	root.add_child(we)

	# ---------- خورشید ----------
	sun = DirectionalLight3D.new()
	sun.light_color = Color(1.0, 0.94, 0.85)
	sun.light_energy = 1.35
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 1600.0
	sun.directional_shadow_blend_splits = true
	sun.shadow_bias = 0.03
	sun.shadow_normal_bias = 2.0
	# قرار دادن نور در جهت خورشید
	var target := Vector3.ZERO
	sun.look_at_from_position(target + SUN_DIR * 1000.0, target, Vector3.UP)
	root.add_child(sun)

	# ---------- فلر خورشید ----------
	flare = Sprite3D.new()
	flare.texture = _glow_texture()
	flare.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	flare.modulate = Color(1.0, 0.92, 0.75, 0.85)
	flare.pixel_size = 480.0
	flare.no_depth_test = true
	flare.render_priority = 90
	root.add_child(flare)

	# ---------- ابرها ----------
	clouds_root = Node3D.new()
	root.add_child(clouds_root)
	var ctex := _cloud_texture()
	var rng := RandomNumberGenerator.new()
	rng.seed = 42
	for c in 34:
		var cx := rng.randf_range(-11000, 11000)
		var cz := rng.randf_range(-11000, 11000)
		var cy := rng.randf_range(2500, 4600)
		var base_scale := rng.randf_range(380, 900)
		var puffs := 4 + rng.randi_range(0, 4)
		for p in puffs:
			var sp := Sprite3D.new()
			sp.texture = ctex
			sp.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			sp.modulate = Color(1, 1, 1, rng.randf_range(0.45, 0.8))
			sp.pixel_size = 1.0
			sp.position = Vector3(cx + rng.randf_range(-1, 1) * base_scale * 2.2,
					cy + rng.randf_range(0, 1) * base_scale * 0.4,
					cz + rng.randf_range(-1, 1) * base_scale * 1.7)
			var w: float = base_scale * rng.randf_range(0.75, 1.45)
			sp.pixel_size = w / 256.0
			sp.shaded = true
			sp.double_sided = false
			clouds_root.add_child(sp)
			_cloud_sprites.append(sp)

func update(cam: Camera3D, dt: float) -> void:
	# فلر فقط وقتی خورشید جلوی دوربین است
	var cam_fwd := -cam.global_transform.basis.z
	var facing := cam_fwd.dot(SUN_DIR)
	if facing > 0.25:
		flare.global_position = cam.global_position + SUN_DIR * 15000.0
		flare.modulate.a = clampf((facing - 0.25) * 3.0, 0.0, 1.0) * 0.9
		flare.visible = true
	else:
		flare.visible = false
	# باد ابر
	for sp in _cloud_sprites:
		sp.position.x += 4.0 * dt
		if sp.position.x - cam.global_position.x > 12000:
			sp.position.x -= 24000
		elif sp.position.x - cam.global_position.x < -12000:
			sp.position.x += 24000
		if sp.position.z - cam.global_position.z > 12000:
			sp.position.z -= 24000
		elif sp.position.z - cam.global_position.z < -12000:
			sp.position.z += 24000

func _glow_texture() -> Texture2D:
	var img := Image.create(128, 128, false, Image.FORMAT_RGBA8)
	for y in 128:
		for x in 128:
			var d := Vector2(x - 64, y - 64).length() / 62.0
			var a: float = clampf(1.0 - d, 0.0, 1.0)
			a = pow(a, 2.2)
			img.set_pixel(x, y, Color(1.0, 0.95, 0.85, a))
	return ImageTexture.create_from_image(img)

func _cloud_texture() -> Texture2D:
	var img := Image.create(256, 256, false, Image.FORMAT_RGBA8)
	var rng := RandomNumberGenerator.new()
	rng.seed = 9
	for y in 256:
		for x in 256:
			var d := Vector2(x - 128, y - 128).length() / 122.0
			var a: float = clampf(1.0 - d, 0.0, 1.0)
			a = a * a * (3.0 - 2.0 * a)
			img.set_pixel(x, y, Color(1, 1, 1, a * 0.75))
	# پفک‌ها
	for i in 22:
		var px := rng.randi_range(48, 208)
		var py := rng.randi_range(40, 170)
		var r := rng.randi_range(14, 40)
		for y in range(max(0, py - r), min(256, py + r)):
			for x in range(max(0, px - r), min(256, px + r)):
				var d := Vector2(x - px, (y - py) * 1.35).length() / r
				if d < 1.0:
					var a := (1.0 - d) * 0.5
					var c := img.get_pixel(x, y)
					img.set_pixel(x, y, Color(1, 1, 1, clampf(maxf(c.a, a), 0, 1)))
	# سایه پایین
	for y in range(150, 240):
		for x in 256:
			var c := img.get_pixel(x, y)
			if c.a > 0.02:
				var k: float = 1.0 - clampf((y - 150.0) / 90.0, 0.0, 1.0) * 0.25
				img.set_pixel(x, y, Color(c.r * k, c.g * k, c.b * 1.02, c.a))
	return ImageTexture.create_from_image(img)
