import tkinter as tk

def count_text():
    memo=memo_text.get('1.0', tk.END)
    length=len(memo.strip())
    result_label.config(text=f'글자 수: {length}')

window = tk.Tk()
window.title("간단 메모장")
window.geometry("420x320")

memo_text=tk.Text(window, width=40, height=10)
memo_text.pack(pady=10)

tk.Button(window, text="글자 수 확인", command=count_text).pack()

result_label = tk.Label(window, text="글자 수:")
result_label.pack(pady=15)

window.mainloop()
