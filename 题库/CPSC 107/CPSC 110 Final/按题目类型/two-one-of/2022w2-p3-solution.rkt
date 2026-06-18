;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #t #t none #f () #f)))
(require spd/tags)

(@assignment exams/2022w2-f/f-p3)




(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line


(@htdd BinTree)
(define-struct node (key val lef rig))
;; BinTree is one of:
;; - false
;; - (make-node Integer String BinTree BinTree)
;; interp. a binary tree

(define BT0 false)
(define BT10 (make-node 10 "10" false false))
(define BT30 (make-node 30 "30" BT10 (make-node 40 "40" false false)))


;;
;; Design a function that consumes two binary trees and produces true if they are
;; equal.  Note that this problem will not be hand-graded, but you should find it
;; helpful to treat it as a two-one-of problem and sketch out a cross-product of
;; type comments table anyways.
;;
;; All recipe steps.
;; Standard HtDF instructions
;;

(@htdf btree-equal?)
(@signature BinTree BinTree -> Boolean)
;; produce true if t1 and t2 are equal (keys and vals match recursively)

(check-expect (btree-equal? false false) true)
(check-expect (btree-equal? false BT10) false)
(check-expect (btree-equal? BT10 false) false)
(check-expect (btree-equal? BT10 BT10) true)
(check-expect (btree-equal? BT30 BT30) true)
(check-expect (btree-equal? BT10 BT30) false)
(check-expect (btree-equal? BT30 BT10) false)

(@template-origin 2-one-of)

;;     bt1         false     (make-node Int Str BinTree BinTree)
;; bt2
;;
;; false           true      false
;;
;; (make-node...)  false     (and (= <keys>)
;;                                (string=? <vals>)
;;                                (btree-equal? <lefts>)
;;                                (btree-equal? <rights>))

(define (btree-equal? t1 t2)
  (cond [(and (false? t1) (false? t2)) true]
        [(false? t1) false]
        [(false? t2) false]
        [else
         (and (= (node-key t1) (node-key t2))
              (string=? (node-val t1) (node-val t2))
              (btree-equal? (node-lef t1) (node-lef t1))
              (btree-equal? (node-rig t1) (node-rig t2)))]))
