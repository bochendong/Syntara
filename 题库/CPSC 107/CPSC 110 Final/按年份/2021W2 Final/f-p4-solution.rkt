;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p4-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w2-f/f-p4)

(@problem 1)
(@problem 2)
(@problem 3)
(@problem 4)


(@htdf append-all-odd-lengths)
(@signature (listof String) -> String)
;; string-append the strings with odd length
(check-expect (append-all-odd-lengths empty) "")
(check-expect (append-all-odd-lengths (list "a" "bcde" "fgh")) "afgh")

;; SOLUTION
(@template-origin fn-composition use-abstract-fn)

(define (append-all-odd-lengths los)
  (foldr string-append
         ""
         (filter (lambda (str) (odd? (string-length str)))
                 los))
  #;
  (local [(define (append-all-odd-lengths los)
            (foldr string-append "" (filter all-odd? los)))
          (define (all-odd? s)
            (odd? (string-length s)))]
           
    (append-all-odd-lengths los)))

