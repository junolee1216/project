import tkinter as tk

def show_result():
    if agree_var.get() and second_var.get():
        result_label.config(text="모두 동의를 했습니다.")
    elif agree_var.get():
        result_label.config(text="숙제 완료에 동의를 했습니다.")
    elif second_var.get():
        result_label.config(text="준비물 챙기기에 동의를 했습니다.")
    else:
        result_label.config(text="동의를 안했습니다.")

window = tk.Tk()
window.title("체크박스")
window.geometry("380x220")

agree_var = tk.BooleanVar()
second_var = tk.BooleanVar()

check = tk.Checkbutton(window, text="숙제를 완료했습니다.", variable=agree_var)
check.pack(pady=20)

check2 = tk.Checkbutton(window, text="준비물을 챙겼습니다.", variable=second_var)
check2.pack(pady=20)

tk.Button(window, text="확인", command=show_result).pack()

result_label = tk.Label(window, text="")
result_label.pack(pady=15)

window.mainloop()
