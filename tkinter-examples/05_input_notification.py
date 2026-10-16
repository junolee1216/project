import tkinter as tk
from tkinter import messagebox

def save_memo():
    inputs=input_entry.get()
    messagebox.showinfo('저장 완료', f'{inputs} 메모가 저장되었습니다.')
def save__memo():
    messagebox.showinfo('저장 중', '잠시만 기다려 주세요.')

window = tk.Tk()
window.title("알림창 연습")
window.geometry("340x180")

tk.Label(window, text='저장 버튼을 눌러 보세요').pack(pady=25)
input_entry=tk.Entry(window)
input_entry.pack()
tk.Button(window, text='저장', command=save_memo).pack(pady=10)
tk.Button(window, text='저장', command=save__memo).pack()

window.mainloop()
