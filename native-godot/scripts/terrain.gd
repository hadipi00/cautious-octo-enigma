class_name AirdomTerrain
extends Node3D
## زمین پروسیجرال کویر + باند متفقین — یک بار ساخته می‌شود، height_at برای فیزیک

const SIZE := 24000.0
const SEG := 320
const F_BASE := Vector2(-4200.0, 0.0)
const F_ENEMY := Vector2(4600.0, 1500.0)

var _noise: FastNoiseLite
var _heights: PackedFloat32Array
var _n: int

func _ready() -> void:
	_n = SEG + 1
	_noise = FastNoiseLite.new()
	_noise.seed = 1337
	_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
	_noise.fractal_type = FastNoiseLite.FRACTAL_FBM
	_noise.fractal_octaves = 5
	_heights.resize(_n * _n)
	_build_mesh()
	_build_base()

func base_height(x: float, z: float) -> float:
	var h := _noise.get_noise_2d(x * 0.00018, z * 0.00018) * 30.0
	h += absf(_noise.get_noise_2d(x * 0.00003 + 41.7, z * 0.00003 + 13.1)) * 55.0
	h += _noise.get_noise_2d(x * 0.0012 + 77.0, z * 0.0012 + 5.0) * 4.0
	h += 30.0
	h = _flatten(h, x, z, F_BASE, 1000.0, 30.0)
	h = _flatten(h, x, z, F_ENEMY, 1000.0, 48.0)
	return h

func _flatten(h: float, x: float, z: float, c: Vector2, r: float, elev: float) -> float:
	var d := Vector2(x, z).distance_to(c)
	if d >= r * 1.45:
		return h
	var t := smoothstep(r, r * 1.45, d)
	return lerpf(elev, h, t)

func height_at(x: float, z: float) -> float:
	var fx := clampf((x + SIZE * 0.5) / (SIZE / SEG), 0.0, SEG - 0.001)
	var fz := clampf((z + SIZE * 0.5) / (SIZE / SEG), 0.0, SEG - 0.001)
	var i := int(fx)
	var j := int(fz)
	var tx := fx - i
	var tz := fz - j
	var h00 := _heights[j * _n + i]
	var h10 := _heights[j * _n + i + 1]
	var h01 := _heights[(j + 1) * _n + i]
	var h11 := _heights[(j + 1) * _n + i + 1]
	return lerpf(lerpf(h00, h10, tx), lerpf(h01, h11, tx), tz)

func _build_mesh() -> void:
	var step := SIZE / SEG
	var half := SIZE * 0.5
	var verts := PackedVector3Array()
	var normals := PackedVector3Array()
	var colors := PackedColorArray()
	var idx := PackedInt32Array()
	verts.resize(_n * _n)
	normals.resize(_n * _n)
	colors.resize(_n * _n)

	for j in _n:
		for i in _n:
			var x := -half + i * step
			var z := -half + j * step
			var h := base_height(x, z)
			_heights[j * _n + i] = h
			verts[j * _n + i] = Vector3(x, h, z)

	for j in _n:
		for i in _n:
			var h := _heights[j * _n + i]
			var hx := _heights[j * _n + mini(i + 1, SEG)] - _heights[j * _n + maxi(i - 1, 0)]
			var hz := _heights[mini(j + 1, SEG) * _n + i] - _heights[maxi(j - 1, 0) * _n + i]
			var slope: float = clampf((absf(hx) + absf(hz)) / (2.0 * step * 0.30), 0.0, 1.0)
			var mott := _noise.get_noise_2d(h * 0.05 + 9.0, (j * 3.7 + i) * 0.13)
			var c := Color(0.78 + mott * 0.06, 0.66 + mott * 0.05, 0.44 + mott * 0.04)
			if h < 24.0:
				c = c.lerp(Color(0.55, 0.48, 0.36), clampf((24.0 - h) / 14.0, 0.0, 1.0) * 0.8)
			if h > 60.0:
				c = c.lerp(Color(0.66, 0.59, 0.50), clampf((h - 60.0) / 26.0, 0.0, 1.0) * 0.6)
			c = c.lerp(Color(0.50, 0.44, 0.40), slope * 0.85)
			colors[j * _n + i] = c
			var nrm := Vector3(-hx, 2.0 * step, -hz).normalized()
			normals[j * _n + i] = nrm

	for j in SEG:
		for i in SEG:
			var a := j * _n + i
			var b := a + 1
			var c2 := a + _n
			var d := c2 + 1
			idx.append_array(PackedInt32Array([a, c2, b, b, c2, d]))

	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 1.0
	mesh.surface_set_material(0, mat)

	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	add_child(mi)

func _build_base() -> void:
	# باند متفقین
	var rw := PlaneMesh.new()
	rw.size = Vector2(46, 2600)
	var rwmi := MeshInstance3D.new()
	rwmi.mesh = rw
	rwmi.material_override = _runway_material()
	rwmi.position = Vector3(F_BASE.x, 30.25, F_BASE.y)
	rwmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(rwmi)

	# سکوی پارک
	var ap := PlaneMesh.new()
	ap.size = Vector2(190, 150)
	var apmi := MeshInstance3D.new()
	apmi.mesh = ap
	var apmat := StandardMaterial3D.new()
	apmat.albedo_color = Color(0.42, 0.42, 0.40)
	apmat.roughness = 1.0
	apmi.material_override = apmat
	apmi.position = Vector3(F_BASE.x + 130, 30.2, F_BASE.y - 1050)
	apmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(apmi)

	# چراغ‌های لبه باند (MultiMesh — یک دراکال)
	var sph := SphereMesh.new()
	sph.radius = 0.55
	sph.height = 1.1
	var lmat := StandardMaterial3D.new()
	lmat.albedo_color = Color(1.0, 0.95, 0.65)
	lmat.emission_enabled = true
	lmat.emission = Color(1.0, 0.9, 0.55)
	lmat.emission_energy_multiplier = 2.0
	sph.material = lmat
	var count := int(2600.0 / 65.0) * 2 + 2
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = sph
	mm.instance_count = count
	var k := 0
	var d := -1300.0
	while d <= 1300.0 and k < count:
		mm.set_instance_transform(k, Transform3D(Basis(), Vector3(F_BASE.x - 23.5, 30.6, F_BASE.y + d)))
		k += 1
		mm.set_instance_transform(k, Transform3D(Basis(), Vector3(F_BASE.x + 23.5, 30.6, F_BASE.y + d)))
		k += 1
		d += 65.0
	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)

	# چند سازه در بیس دشمن (اهداف بصری — نابودی در فاز بعد)
	for b in 4:
		var box := BoxMesh.new()
		box.size = Vector3(40, 12, 60)
		var bmi := MeshInstance3D.new()
		bmi.mesh = box
		var bmat := StandardMaterial3D.new()
		bmat.albedo_color = Color(0.45, 0.40, 0.34)
		bmat.roughness = 0.9
		bmi.material_override = bmat
		var ang := float(b) * TAU / 4.0
		bmi.position = Vector3(F_ENEMY.x + cos(ang) * 220.0, 48.0 + 6.0, F_ENEMY.y + sin(ang) * 220.0)
		add_child(bmi)

func _runway_material() -> StandardMaterial3D:
	var img := Image.create(128, 1024, false, Image.FORMAT_RGB8)
	for y in 1024:
		for x in 128:
			var v := 60 + int(randf() * 14.0)
			var c := Color8(v, v, v + 3)
			if x < 7 or x > 120:
				c = Color8(230, 230, 220)
			img.set_pixel(x, y, c)
	for d in range(0, 1024, 90):   # خط‌چین وسط
		for y in range(d, mini(d + 45, 1024)):
			for x in range(60, 68):
				img.set_pixel(x, y, Color8(235, 235, 225))
	for i in 8:                     # نوارهای آستانه
		for y in range(15, 55):
			for x in range(15 + i * 12, 23 + i * 12):
				img.set_pixel(x, y, Color8(235, 235, 225))
				img.set_pixel(x, 1023 - y, Color8(235, 235, 225))
	var tex := ImageTexture.create_from_image(img)
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = tex
	mat.roughness = 0.95
	return mat
