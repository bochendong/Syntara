;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib  "htdp-intermediate-lambda-reader.ss" "lang")((modname decoder-ring) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #t)))
(require spd/tags)


(@assignment f-p4)

(@cwl ???)   ;fill in your CWL here (same CWL you put for problem sets)

(@problem 1) ;This is actually problem 4, DO NOT EDIT OR DELETE THIS LINE!

(@htdf decode)
(@signature (listof Natural) -> Natural)
;; decode message consisting of skip instructions and numbers to sum
(check-expect (decode (list)) 0)
(check-expect (decode (list 3)) 0)
(check-expect (decode (list 2)) 2)
(check-expect (decode (list 2 4)) 6)
(check-expect (decode (list 1 2 4)) 4)
(check-expect (decode (list 1 3 4 6 8 2 4)) 4)
(check-expect (decode (list 1 2 4 3 2 4 6 8 4)) (+ 4 8 4))

(@template-origin (listof X) accumulator)

(define (decode loi0)
  ;; skipn is Natural; number of even numbers remaining to skip
  ;; rsf is Natural; sum of unskipped even numbers so far
  (local [(define (scan lst skipn rsf)
            (cond [(empty? lst) rsf]
                  [else
                   (cond [(odd? (first lst))
                          (scan (rest lst)
                                (+ skipn (first lst))
                                rsf)]
                         [(> skipn 0)
                          (scan (rest lst)
                                (sub1 skipn)
                                rsf)]
                         [else
                          (scan (rest lst)
                                0
                                (+ rsf (first lst)))])]))]
    (scan loi0 0 0)))


                                
