import matplotlib.pyplot as plt
from scipy.signal import savgol_filter

# Ваши данные
steps = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 
         1500, 1600, 1700, 1800, 1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700]

train_loss = [0.207230, 0.071599, 0.081967, 0.084345, 0.078945, 0.048736, 0.040846, 0.010914, 0.053695, 0.039815, 
              0.039550, 0.031509, 0.012518, 0.014202, 0.003630, 0.009654, 0.012097, 0.000240, 0.027900, 0.001910, 
              0.000195, 0.000139, 0.000127, 0.006883, 0.000129, 0.021559, 0.000123]

val_loss = [0.121044, 0.039790, 0.034682, 0.028543, 0.018581, 0.022832, 0.051887, 0.047733, 0.064811, 0.140981, 
            0.065056, 0.152475, 0.081682, 0.024521, 0.045516, 0.021429, 0.063078, 0.025948, 0.141087, 0.062122, 
            0.027668, 0.058483, 0.050136, 0.049499, 0.028451, 0.073148, 0.061713]

accuracy = [0.963425, 0.988362, 0.991687, 0.992519, 0.995844, 0.994181, 0.989194, 0.990025, 0.989194, 0.963425, 
            0.988362, 0.972569, 0.984206, 0.995844, 0.991687, 0.996675, 0.989194, 0.995012, 0.976725, 0.990025, 
            0.995012, 0.990856, 0.990025, 0.991687, 0.994181, 0.989194, 0.990856]

# Параметры сглаживания (window_length должен быть нечетным и меньше количества данных)
window = 7
poly = 2

# Применяем фильтр
smooth_train = savgol_filter(train_loss, window, poly)
smooth_val = savgol_filter(val_loss, window, poly)
smooth_acc = savgol_filter(accuracy, window, poly)

# 1. График потерь
plt.figure(figsize=(10, 5))
plt.plot(steps, smooth_train, label='Training Loss', color='blue', linewidth=2)
plt.plot(steps, smooth_val, label='Validation Loss', color='orange', linewidth=2)
plt.title('Model Training and Validation Loss')
plt.xlabel('Steps')
plt.ylabel('Loss')
plt.legend()
plt.grid(True, alpha=0.3)
plt.show()

# 2. График точности
plt.figure(figsize=(10, 5))
plt.plot(steps, smooth_acc, label='Validation Accuracy', color='green', linewidth=2)
plt.title('Model Validation Accuracy')
plt.xlabel('Steps')
plt.ylabel('Accuracy')
plt.legend()
plt.grid(True, alpha=0.3)
plt.show()