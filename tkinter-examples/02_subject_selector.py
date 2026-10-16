import tkinter as tk

def choose_subject():
    index=subject_list.curselection()
    if index:
        subject=subject_list.get(index[0])
        result_label.config(text=f'선택한 과목: {subject}')

window = tk.Tk()
window.title("과목 선택")
window.geometry("360x280")

subject_list=tk.Listbox(window, height=5)
for subject in ['Python', 'tkinter', 'HTML', 'JavaScript', 'C']:
    subject_list.insert(tk.END, subject)
subject_list.pack(pady=15)

tk.Button(window, text="선택", command=choose_subject).pack()

result_label = tk.Label(window, text="")
result_label.pack(pady=15)

window.mainloop()
