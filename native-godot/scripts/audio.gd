class_name GameAudio
extends Node
## صدای سینتیز WebAudio-like با AudioStreamWAV — بدون فایل صوتی

var _engine: AudioStreamPlayer
var _gun_players: Array = []
var _gun_i := 0
var _boom_players: Array = []
var _boom_i := 0

func _ready() -> void:
	_engine = AudioStreamPlayer.new()
	var ew := _wav_engine()
	ew.loop_mode = AudioStreamWAV.LOOP_FORWARD
	ew.loop_begin = 0
	ew.loop_end = ew.data.size() / 2
	_engine.stream = ew
	_engine.volume_db = -40.0
	add_child(_engine)
	_engine.play()

	for i in 4:
		var gp := AudioStreamPlayer.new()
		gp.stream = _wav_gun()
		gp.volume_db = -8.0
		add_child(gp)
		_gun_players.append(gp)
	for i in 3:
		var bp := AudioStreamPlayer.new()
		bp.stream = _wav_explosion()
		bp.volume_db = -4.0
		add_child(bp)
		_boom_players.append(bp)

func update_engine(throttle: float, ab: bool, v: float) -> void:
	if _engine == null:
		return
	_engine.pitch_scale = 0.55 + throttle * 0.6 + (0.22 if ab else 0.0)
	var target_db := -40.0 + throttle * 32.0 + (4.0 if ab else 0.0) + clampf(v / 900.0, 0.0, 1.0) * 5.0
	_engine.volume_db = lerpf(_engine.volume_db, target_db, 0.08)

func gun() -> void:
	_gun_i = (_gun_i + 1) % _gun_players.size()
	_gun_players[_gun_i].pitch_scale = randf_range(0.9, 1.1)
	_gun_players[_gun_i].play()

func explosion() -> void:
	_boom_i = (_boom_i + 1) % _boom_players.size()
	_boom_players[_boom_i].play()

func missile() -> void:
	beep(300.0, 0.5, 0.3)

func beep(freq: float, dur: float, vol: float) -> void:
	var rate := 22050
	var n := int(dur * rate)
	var samples := PackedFloat32Array()
	samples.resize(n)
	for i in n:
		var t := float(i) / rate
		var env: float = 1.0 if t < dur * 0.8 else (dur - t) / (dur * 0.2)
		samples[i] = sin(TAU * freq * t) * 0.6 * env
	var p := AudioStreamPlayer.new()
	p.stream = _wav(samples, rate)
	p.volume_db = linear_to_db(clampf(vol, 0.01, 1.0))
	add_child(p)
	p.play()
	get_tree().create_timer(dur + 0.3).timeout.connect(p.queue_free)

# ---------- تولید نمونه‌ها ----------

func _wav_engine() -> AudioStreamWAV:
	var rate := 22050
	var n := rate  # یک ثانیه loop
	var samples := PackedFloat32Array()
	samples.resize(n)
	for i in n:
		var t := float(i) / rate
		var v := 0.34 * sin(TAU * 70.0 * t) + 0.24 * sin(TAU * 71.7 * t)
		v += 0.20 * sin(TAU * 141.0 * t) + 0.10 * sin(TAU * 213.0 * t)
		v += (randf() * 2.0 - 1.0) * 0.05
		samples[i] = v * 0.8
	return _wav(samples, rate)

func _wav_gun() -> AudioStreamWAV:
	var rate := 22050
	var n := int(0.14 * rate)
	var samples := PackedFloat32Array()
	samples.resize(n)
	for i in n:
		var t := float(i) / rate
		var env := exp(-t * 26.0)
		samples[i] = ((randf() * 2.0 - 1.0) * 0.8 + 0.5 * sin(TAU * 95.0 * t)) * env
	return _wav(samples, rate)

func _wav_explosion() -> AudioStreamWAV:
	var rate := 22050
	var n := int(1.5 * rate)
	var samples := PackedFloat32Array()
	samples.resize(n)
	for i in n:
		var t := float(i) / rate
		var env := exp(-t * 2.6)
		var rumble := 0.6 * sin(TAU * 46.0 * t * (1.0 - t * 0.3))
		samples[i] = ((randf() * 2.0 - 1.0) * 0.75 + rumble) * env
	return _wav(samples, rate)

func _wav(samples: PackedFloat32Array, rate: int) -> AudioStreamWAV:
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = rate
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		bytes.encode_s16(i * 2, int(clampf(samples[i], -1.0, 1.0) * 32000.0))
	wav.data = bytes
	return wav
