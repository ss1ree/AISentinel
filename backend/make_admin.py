from database import SessionLocal, User

# Замените на email, с которым вы зарегистрировались!
TARGET_EMAIL = "raizer04@mail.ru" 

db = SessionLocal()
user = db.query(User).filter(User.email == TARGET_EMAIL).first()

if user:
    user.role = "admin"
    db.commit()
    print(f"Пользователь {TARGET_EMAIL} успешно назначен администратором!")
else:
    print("Пользователь с таким email не найден.")
    
db.close()