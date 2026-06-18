;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname 2022w2-p4-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
(require spd/tags)

(@assignment exams/2022w2-f/f-p4)




(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line


(@htdf max-length)
(@signature (listof String) -> Natural)
;; produce length of longest string; 0 if list is empty
(check-expect (max-length (list)) 0)
(check-expect (max-length (list "ab" "d" "efg")) 3)
(check-expect (max-length (list "abcd" "de" "efg")) 4)

(@template-origin fn-composition use-abstract-fn)

(define (max-length los)
  (foldr max 0 (map string-length los)))


