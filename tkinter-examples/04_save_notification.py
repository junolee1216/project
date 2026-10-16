import tkinter as tk
from tkinter import messagebox

def save_memo():
    messagebox.showinfo('저장 완료', '메모가 저장되었습니다.')

window = tk.Tk()
window.title("알림창 연습")
window.geometry("340x180")

tk.Label(window, text='저장 버튼을 눌러 보세요').pack(pady=25)
tk.Button(window, text='저장', command=save_memo).pack()

window.mainloop()
