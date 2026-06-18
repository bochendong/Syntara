;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p4-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2023s-f/f-p4)




(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line


(@htdf concat-if)
(@signature (listof String) (String -> Boolean) -> String)
;; combine all strings for with pred? produces true into a single string
(check-expect (concat-if empty
                         (lambda (s) true))
              "")
(check-expect (concat-if (list "a" "x" "b" "y" "c" "z")
                         (lambda (s) (string<? s "m")))
              "abc")

(@template-origin fn-composition use-abstract-fn)


(define (concat-if los pred?)
  (foldr string-append "" (filter pred? los)))
